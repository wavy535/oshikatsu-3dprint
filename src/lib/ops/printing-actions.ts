"use server";

import { checkStoredFile } from "@/lib/files/storage";
import { atomicBatch, assertQuery } from "@/lib/db/client";
import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/auth/guards";
import type {
  PrintJobStatus,
  QcResult,
  ReprintCause,
  TablesUpdate,
} from "@/types/db";
import type { OpsActionState } from "./action-state";

function revalidateJob(jobId: string) {
  revalidatePath("/admin/print-queue");
  revalidatePath(`/admin/print-queue/${jobId}`);
  revalidatePath(`/admin/print-queue/${jobId}/qc`);
}

/** 状態の検査と更新を同じSQLで行い、古い画面からの操作を拒否する。 */
async function updateJob(
  jobId: string,
  patch: TablesUpdate<"print_jobs">,
  allowedFrom: PrintJobStatus[],
): Promise<OpsActionState> {
  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("print_jobs")
      .set(patch)
      .where("id", "=", jobId)
      .where("status", "in", allowedFrom)
      .returning("id")
      .executeTakeFirst(),
  );
  if (error) return { error: `更新に失敗しました（${error.message}）` };
  if (!data)
    return {
      error:
        "このジョブの状態では実行できません（画面を読み込み直してください）",
    };
  revalidateJob(jobId);
  return { error: null };
}

/** 印刷開始。プリンタを割り当て、担当を自分にする。購入者への通知はDBトリガーが出す。 */
export async function startPrintJobAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };
  if (!printerId) return { error: "プリンタを選んでください" };

  const { user } = await requireAdmin();
  return updateJob(
    jobId,
    { status: "printing", printer_id: printerId, assignee_id: user.id },
    ["queued", "qc_failed", "reprinting"],
  );
}

/** 印刷を中断してキューへ戻す。 */
export async function pausePrintJobAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };
  return updateJob(jobId, { status: "queued" }, ["printing", "reprinting"]);
}

/** バッチを1回ぶん消化する（ベッドに載りきらない作品は何回かに分けて刷る）。 */
export async function advanceBatchAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };

  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("print_jobs")
      .set({ batch_done: sql`batch_done + 1` })
      .where("id", "=", jobId)
      .where("status", "in", ["printing", "reprinting"])
      .whereRef("batch_done", "<", "batch_count")
      .returning("id")
      .executeTakeFirst(),
  );
  if (error) return { error: "バッチを更新できませんでした" };
  if (!data)
    return {
      error: "進められるバッチがありません（画面を読み込み直してください）",
    };
  revalidateJob(jobId);
  return { error: null };
}

const finishSchema = z.object({
  actualGrams: z.coerce.number().min(0, "0以上で入力してください").max(20000),
  actualHours: z.coerce.number().min(0, "0以上で入力してください").max(999),
  failureCount: z.coerce.number().int().min(0).max(99),
  filamentId: idSchema.optional().or(z.literal("")),
});

/**
 * 印刷完了（＝検品待ち）にして実績を記録する。
 *
 * 実使用グラムを入れたら、そのぶんフィラメント台帳に消費を積む
 * （`filaments.stock_grams` は台帳の結果。トリガーが減らす）。
 */
export async function finishPrintJobAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };

  const parsed = finishSchema.safeParse({
    actualGrams: formData.get("actualGrams"),
    actualHours: formData.get("actualHours"),
    failureCount: formData.get("failureCount") ?? 0,
    filamentId: formData.get("filamentId") ?? "",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { actualGrams, actualHours, failureCount, filamentId } = parsed.data;

  const { db, user } = await requireAdmin();

  const { error } = await queryResult(
    atomicBatch(db, [
      assertQuery(
        db
          .selectFrom("print_jobs")
          .select("id")
          .where("id", "=", jobId)
          .where("status", "in", ["printing", "reprinting"]),
      ),
      db
        .updateTable("print_jobs")
        .set({
          status: "printed",
          actual_filament_grams: actualGrams,
          actual_print_hours: actualHours,
          failure_count: failureCount,
        })
        .where("id", "=", jobId),
      ...(filamentId && actualGrams > 0
        ? [
            db
              .insertInto("filament_ledger")
              .values({
                filament_id: filamentId,
                delta_grams: -actualGrams,
                reason: "print",
                print_job_id: jobId,
                actor_id: user.id,
              }),
          ]
        : []),
    ]),
  );
  if (error)
    return { error: `印刷完了を保存できませんでした（${error.message}）` };
  revalidateJob(jobId);

  return { error: null, message: "実績を記録して検品待ちにしました" };
}

/** 検品NGのあと、刷り直しを始める。 */
export async function startReprintAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };

  const { user } = await requireAdmin();
  return updateJob(
    jobId,
    {
      status: "reprinting",
      ...(printerId ? { printer_id: printerId } : {}),
      assignee_id: user.id,
      batch_done: 0,
    },
    ["qc_failed"],
  );
}

const qcSchema = z.object({
  jobId: idSchema,
  memo: z.string().max(2000).optional(),
  reprintCause: z.enum(["model", "print", "material", "handling"]).optional(),
});

/**
 * 検品結果の登録。
 *
 * ジョブのステータス（qc_passed / qc_failed）も、原因が `model` のときの
 * 修正依頼も、注文ステータスの更新も**DBのトリガーがやる**。ここでは
 * qc_inspections と qc_check_results を書くだけ。
 */
export async function submitQcAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = qcSchema.safeParse({
    jobId: formData.get("jobId"),
    memo: String(formData.get("memo") ?? "") || undefined,
    reprintCause: (String(formData.get("reprintCause") ?? "") || undefined) as
      | ReprintCause
      | undefined,
  });
  if (!parsed.success) return { error: "入力内容を確認してください" };
  const { jobId, memo, reprintCause } = parsed.data;

  const { db, user } = await requireAdmin();

  const { data: job } = await queryResult(
    db
      .selectFrom("print_queue")
      .select(["print_queue.status", "print_queue.work_id"])
      .where("print_queue.id", "=", jobId)
      .executeTakeFirst(),
  );
  if (!job) return { error: "ジョブが見つかりません" };
  if (job.status !== "printed" && job.status !== "qc_failed") {
    return { error: "印刷が終わったジョブだけ検品できます" };
  }

  const photoPaths = formData
    .getAll("photoPaths")
    .map((v) => String(v))
    .filter(Boolean);

  if (
    photoPaths.length > 6 ||
    photoPaths.some((path) => !path.startsWith(`${job.work_id}/${jobId}/`))
  )
    return { error: "検品写真の指定が不正です" };
  for (const path of photoPaths) {
    const stored = await queryResult(
      checkStoredFile("qc-photos", path, 8 * 1024 * 1024),
    );
    if (stored.error) return { error: "検品写真を確認できませんでした" };
  }

  const { data: result, error } = await queryResult(
    (async () => {
      const definitions = await db
        .selectFrom("qc_check_definitions")
        .select("code")
        .where("is_active", "=", true)
        .execute();
      if (!definitions.length) throw new Error("検品項目が設定されていません");
      const results = definitions.map(({ code }) => {
        const answer = formData.get(`check_${code}`);
        if (answer !== "pass" && answer !== "fail")
          throw new Error("すべての項目に OK / NG を付けてください");
        return {
          code,
          passed: answer === "pass",
          note: String(formData.get(`note_${code}`) ?? "") || null,
        };
      });
      const result: QcResult = results.every((r) => r.passed)
        ? "passed"
        : "failed";
      if (result === "failed" && !reprintCause)
        throw new Error("NG があるときは再印刷の原因を選んでください");
      const inspectionId = crypto.randomUUID();
      await atomicBatch(db, [
        assertQuery(
          db
            .selectFrom("print_jobs")
            .select("id")
            .where("id", "=", jobId)
            .where("status", "in", ["printed", "qc_failed"]),
        ),
        {
          sql: "INSERT INTO _assert(ok) SELECT (SELECT json_group_array(code) FROM (SELECT code FROM qc_check_definitions WHERE is_active ORDER BY code))=?",
          parameters: [JSON.stringify(definitions.map((d) => d.code).sort())],
        },
        db
          .insertInto("qc_inspections")
          .values({
            id: inspectionId,
            print_job_id: jobId,
            inspector_id: user.id,
            result,
            memo: memo ?? null,
            photo_paths: photoPaths,
            reprint_cause: result === "failed" ? reprintCause! : null,
          }),
        db
          .insertInto("qc_check_results")
          .values(
            results.map((r) => ({
              inspection_id: inspectionId,
              code: r.code,
              passed: r.passed,
              note: r.note,
            })),
          ),
      ]);
      return result;
    })(),
  );
  if (error)
    return { error: `検品結果を保存できませんでした（${error.message}）` };

  revalidateJob(jobId);
  return {
    error: null,
    message:
      result === "passed"
        ? "検品OKとして記録しました"
        : reprintCause === "model"
          ? "検品NGとして記録し、クリエイターへ修正依頼を出しました"
          : "検品NGとして記録しました。刷り直してください",
  };
}

// =============================================================================
// 実績の修正
//   完了後に実績（実使用グラム・時間・失敗回数）を直したいときに使う。
//   何をいくらからいくらに直したかは print_job_events の note に残す
//   （フィラメント台帳は触らない。差分は台帳の「棚卸し調整」で合わせる運用）。
// =============================================================================

const editActualsSchema = z.object({
  jobId: idSchema,
  actualGrams: z.coerce.number().min(0).max(20000),
  actualHours: z.coerce.number().min(0).max(999),
  failureCount: z.coerce.number().int().min(0).max(99),
  reason: z.string().trim().min(1, "修正の理由を書いてください").max(200),
});

export async function editActualsAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = editActualsSchema.safeParse({
    jobId: formData.get("jobId"),
    actualGrams: formData.get("actualGrams"),
    actualHours: formData.get("actualHours"),
    failureCount: formData.get("failureCount") ?? 0,
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  const v = parsed.data;

  const { db, user } = await requireAdmin();
  const { error } = await queryResult(
    (async () => {
      const before = await db
        .selectFrom("print_jobs")
        .select([
          "status",
          "actual_filament_grams",
          "actual_print_hours",
          "failure_count",
        ])
        .where("id", "=", v.jobId)
        .executeTakeFirst();
      if (
        !before ||
        !["printed", "qc_passed", "qc_failed"].includes(before.status)
      ) {
        throw new Error("実績を直せるのは印刷が終わったジョブだけです");
      }
      const note =
        `実績を修正（${v.reason}）: ` +
        `${before.actual_filament_grams ?? "—"}g→${v.actualGrams}g, ` +
        `${before.actual_print_hours ?? "—"}h→${v.actualHours}h, ` +
        `失敗 ${before.failure_count}→${v.failureCount}`;
      await atomicBatch(db, [
        assertQuery(
          db
            .selectFrom("print_jobs")
            .select("id")
            .where("id", "=", v.jobId)
            .where("status", "=", before.status)
            .where("actual_filament_grams", "is", before.actual_filament_grams)
            .where("actual_print_hours", "is", before.actual_print_hours)
            .where("failure_count", "=", before.failure_count),
        ),
        db
          .updateTable("print_jobs")
          .set({
            actual_filament_grams: v.actualGrams,
            actual_print_hours: v.actualHours,
            failure_count: v.failureCount,
          })
          .where("id", "=", v.jobId),
        db.insertInto("print_job_events").values({
          print_job_id: v.jobId,
          status: before.status,
          actor_id: user.id,
          note,
        }),
      ]);
    })(),
  );
  if (error) return { error: `実績を保存できませんでした（${error.message}）` };
  revalidateJob(v.jobId);

  return { error: null, message: "実績を直しました。履歴に残ります" };
}

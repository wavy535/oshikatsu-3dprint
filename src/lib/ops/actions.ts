"use server";
import { checkStoredFile } from "@/lib/files/s3";
import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import { sql } from "kysely";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";

import { requireAdmin } from "@/lib/auth/guards";
import type {
  PrintJobStatus,
  QcResult,
  ReprintCause,
  ShippingCarrier,
  TablesUpdate,
} from "@/types/db";

export type OpsActionState = { error: string | null; message?: string };

const OK: OpsActionState = { error: null };

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
  return OK;
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
  return OK;
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
    db.transaction().execute(async (tx) => {
      const job = await tx
        .updateTable("print_jobs")
        .set({
          status: "printed",
          actual_filament_grams: actualGrams,
          actual_print_hours: actualHours,
          failure_count: failureCount,
        })
        .where("id", "=", jobId)
        .where("status", "in", ["printing", "reprinting"])
        .returning("id")
        .executeTakeFirst();
      if (!job) throw new Error("印刷中のジョブだけ完了にできます");
      if (filamentId && actualGrams > 0) {
        await tx
          .insertInto("filament_ledger")
          .values({
            filament_id: filamentId,
            delta_grams: -actualGrams,
            reason: "print",
            print_job_id: jobId,
            actor_id: user.id,
          })
          .execute();
      }
    }),
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
      ReprintCause | undefined,
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
    db.transaction().execute(async (tx) => {
      // The lock also serializes the status changes made by the inspection trigger.
      const current = await tx
        .selectFrom("print_jobs")
        .select("status")
        .where("id", "=", jobId)
        .forUpdate()
        .executeTakeFirst();
      if (!current || !["printed", "qc_failed"].includes(current.status)) {
        throw new Error("印刷が終わったジョブだけ検品できます");
      }
      const definitions = await tx
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
      const inspection = await tx
        .insertInto("qc_inspections")
        .values({
          print_job_id: jobId,
          inspector_id: user.id,
          result,
          memo: memo ?? null,
          photo_paths: photoPaths,
          reprint_cause: result === "failed" ? reprintCause! : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("qc_check_results")
        .values(results.map((r) => ({ inspection_id: inspection.id, ...r })))
        .execute();
      return result;
    }),
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

const shipmentSchema = z.object({
  orderId: idSchema,
  carrier: z.enum(["yamato", "sagawa", "japanpost", "other"]),
  serviceName: z.string().max(60).optional(),
  trackingNumber: z.string().min(4, "追跡番号を入れてください").max(60),
  boxType: z.string().max(60).optional(),
  weightGrams: z.coerce.number().int().min(0).max(50000),
  sizeSumCm: z.coerce.number().int().min(0).max(400),
  shippingFeeJpy: z.coerce.number().int().min(0).max(100000),
});

/**
 * 発送登録。1注文1件（同梱前提）。
 * 注文が「発送済み」になるのも購入者への通知も、DBのトリガーがやる（設計判断9）。
 */
export async function createShipmentAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = shipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    carrier: formData.get("carrier"),
    serviceName: String(formData.get("serviceName") ?? "") || undefined,
    trackingNumber: formData.get("trackingNumber"),
    boxType: String(formData.get("boxType") ?? "") || undefined,
    weightGrams: formData.get("weightGrams") || 0,
    sizeSumCm: formData.get("sizeSumCm") || 0,
    shippingFeeJpy: formData.get("shippingFeeJpy") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const v = parsed.data;

  const { db, user } = await requireAdmin();

  // 全ジョブが検品を通っていないうちは発送させない
  const { data: jobs } = await queryResult(
    db
      .selectFrom("print_jobs")
      .select(["print_jobs.status"])
      .where("print_jobs.order_id", "=", v.orderId)
      .execute(),
  );
  const pending = (jobs ?? []).filter(
    (j) => j.status !== "qc_passed" && j.status !== "cancelled",
  );
  if ((jobs ?? []).length === 0 || pending.length > 0) {
    return { error: "検品が終わっていないジョブがあります" };
  }

  const { data, error } = await queryResult(
    db
      .insertInto("shipments")
      .values({
        order_id: v.orderId,
        carrier: v.carrier as ShippingCarrier,
        service_name: v.serviceName ?? null,
        tracking_number: v.trackingNumber,
        box_type: v.boxType ?? null,
        weight_grams: v.weightGrams,
        size_sum_cm: v.sizeSumCm,
        shipping_fee_jpy: v.shippingFeeJpy,
        packer_id: user.id,
      })
      .returning(["id"])
      .execute(),
  );

  if (error) {
    if (error.code === "23505")
      return { error: "この注文はすでに発送登録されています" };
    return { error: `発送登録に失敗しました（${error.message}）` };
  }
  if (!data || data.length === 0) return { error: "発送登録に失敗しました" };

  revalidatePath("/admin/print-queue");
  revalidatePath("/mypage/orders");
  return {
    error: null,
    message: "発送を登録しました。購入者の注文は「発送済み」になります",
  };
}

// =============================================================================
// フィラメント在庫
//   在庫数は直接書かない。増減は必ず filament_ledger に積み、stock_grams は
//   トリガー（apply_filament_ledger）が更新する。台帳と在庫が食い違わないようにするため。
// =============================================================================

const restockSchema = z.object({
  filamentId: idSchema,
  grams: z.coerce.number().positive("1g以上で入力してください").max(100000),
  reason: z.enum(["restock", "waste", "adjust"]),
});

/** 補充・廃棄・棚卸し調整。廃棄は負の増減として積む。 */
export async function adjustFilamentStockAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = restockSchema.safeParse({
    filamentId: formData.get("filamentId"),
    grams: formData.get("grams"),
    reason: formData.get("reason") ?? "restock",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { filamentId, grams, reason } = parsed.data;

  const { db, user } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .insertInto("filament_ledger")
      .values({
        filament_id: filamentId,
        delta_grams: reason === "waste" ? -grams : grams,
        reason,
        actor_id: user.id,
      })
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0) {
    return {
      error: `台帳への記録に失敗しました（${error?.message ?? "0件"}）`,
    };
  }

  revalidatePath("/admin/filaments");
  return {
    error: null,
    message:
      reason === "waste"
        ? `${grams}g を廃棄として記録しました`
        : `${grams}g を記録しました`,
  };
}

/** 使う／使わないの切り替え。無効にしても作品の色スロットは残る（restrict）。 */
export async function toggleFilamentActiveAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const filamentId = String(formData.get("filamentId") ?? "");
  const next = formData.get("isActive") === "true";
  if (!filamentId) return { error: "フィラメントが指定されていません" };

  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("filaments")
      .set({ is_active: next })
      .where("filaments.id", "=", filamentId)
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: "更新できませんでした" };

  revalidatePath("/admin/filaments");
  return OK;
}

const newFilamentSchema = z.object({
  material: z.enum(["PLA", "PETG", "ABS", "TPU"]),
  colorName: z.string().min(1, "色の名前を入れてください").max(30),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "色コードは #RRGGBB で入力してください"),
  pricePerGram: z.coerce.number().min(0).max(999),
  stockGrams: z.coerce.number().int().min(0).max(100000),
});

/** 新しいフィラメントの登録。初期在庫があれば台帳に「補充」として積む。 */
export async function createFilamentAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = newFilamentSchema.safeParse({
    material: formData.get("material"),
    colorName: String(formData.get("colorName") ?? "").trim(),
    colorHex: String(formData.get("colorHex") ?? "").trim(),
    pricePerGram: formData.get("pricePerGram") || 3.5,
    stockGrams: formData.get("stockGrams") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const v = parsed.data;

  const { db, user } = await requireAdmin();
  const { error } = await queryResult(
    db.transaction().execute(async (tx) => {
      const filament = await tx
        .insertInto("filaments")
        .values({
          material: v.material,
          color_name: v.colorName,
          color_hex: v.colorHex.toUpperCase(),
          price_per_gram: v.pricePerGram,
          stock_grams: 0,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      if (v.stockGrams > 0) {
        await tx
          .insertInto("filament_ledger")
          .values({
            filament_id: filament.id,
            delta_grams: v.stockGrams,
            reason: "restock",
            actor_id: user.id,
          })
          .execute();
      }
    }),
  );
  if (error)
    return {
      error:
        error.code === "23505"
          ? "同じ素材・色のフィラメントがすでにあります"
          : `登録に失敗しました（${error.message}）`,
    };

  revalidatePath("/admin/filaments");
  return {
    error: null,
    message: `${v.material}・${v.colorName} を登録しました`,
  };
}

// =============================================================================
// 払込管理
// =============================================================================

const payoutNextSchema = z.enum(["processing", "paid", "rejected"]);

/** 振込申請を進める。振込済み・却下のときは処理日時を入れる。通知はトリガーが出す。 */
export async function processPayoutAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const id = String(formData.get("id") ?? "");
  const parsed = payoutNextSchema.safeParse(formData.get("next"));
  if (!id || !parsed.success) return { error: "操作が不正です" };
  const next = parsed.data;

  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("payout_requests")
      .set({
        status: next,
        processed_at: next === "processing" ? null : new Date().toISOString(),
      })
      .where("payout_requests.id", "=", id)
      .where(
        sql<boolean>`${sql.ref("payout_requests.status")} = any(${["requested", "processing"]})`,
      )
      .returning(["id"])
      .execute(),
  );
  if (error) return { error: `更新に失敗しました（${error.message}）` };
  if (!data || data.length === 0) return { error: "この申請は更新できません" };

  revalidatePath("/admin/payouts");
  revalidatePath("/studio/payouts");
  return OK;
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
    db.transaction().execute(async (tx) => {
      const before = await tx
        .selectFrom("print_jobs")
        .select([
          "status",
          "actual_filament_grams",
          "actual_print_hours",
          "failure_count",
        ])
        .where("id", "=", v.jobId)
        .forUpdate()
        .executeTakeFirst();
      if (
        !before ||
        !["printed", "qc_passed", "qc_failed"].includes(before.status)
      ) {
        throw new Error("実績を直せるのは印刷が終わったジョブだけです");
      }
      await tx
        .updateTable("print_jobs")
        .set({
          actual_filament_grams: v.actualGrams,
          actual_print_hours: v.actualHours,
          failure_count: v.failureCount,
        })
        .where("id", "=", v.jobId)
        .execute();
      const note =
        `実績を修正（${v.reason}）: ` +
        `${before.actual_filament_grams ?? "—"}g→${v.actualGrams}g, ` +
        `${before.actual_print_hours ?? "—"}h→${v.actualHours}h, ` +
        `失敗 ${before.failure_count}→${v.failureCount}`;
      await tx
        .insertInto("print_job_events")
        .values({
          print_job_id: v.jobId,
          status: before.status,
          actor_id: user.id,
          note,
        })
        .execute();
    }),
  );
  if (error) return { error: `実績を保存できませんでした（${error.message}）` };
  revalidateJob(v.jobId);

  return { error: null, message: "実績を直しました。履歴に残ります" };
}

// =============================================================================
// 運営メンバー
//   role の書き換えは DB の関数（grant_admin / revoke_admin）だけが行う。
//   「自分は解除できない」「最後の1人は解除できない」の判断も関数側にある。
// =============================================================================

const emailSchema = z
  .string()
  .trim()
  .email("メールアドレスの形式が正しくありません")
  .max(254);

export async function grantAdminAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力を確認してください",
    };

  const { db } = await requireAdmin();
  const { error } = await call(db, "grant_admin", { p_email: parsed.data });
  if (error) return { error: error.message };

  revalidatePath("/admin/members");
  return {
    error: null,
    message: `${parsed.data} を運営メンバーに追加しました`,
  };
}

export async function revokeAdminAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = idSchema.safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "操作が不正です" };

  const { db } = await requireAdmin();
  const { error } = await call(db, "revoke_admin", { p_user_id: parsed.data });
  if (error) return { error: error.message };

  revalidatePath("/admin/members");
  return OK;
}

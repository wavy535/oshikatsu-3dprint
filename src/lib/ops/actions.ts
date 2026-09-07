"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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

/**
 * ジョブのステータスを進める。
 *
 * 更新は必ず `.select()` を付けて**更新できた行数を見る**。ポリシーに引っかかると
 * エラーにならず0行更新になり、画面上は成功したように見えてしまうため。
 */
async function updateJob(
  jobId: string,
  patch: TablesUpdate<"print_jobs">,
  allowedFrom?: PrintJobStatus[]
): Promise<OpsActionState> {
  const { supabase } = await requireAdmin();

  if (allowedFrom) {
    const { data: current } = await supabase
      .from("print_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (!current) return { error: "ジョブが見つかりません" };
    if (!allowedFrom.includes(current.status)) {
      return { error: "このジョブの状態では実行できません（画面を読み込み直してください）" };
    }
  }

  const { data, error } = await supabase
    .from("print_jobs")
    .update(patch)
    .eq("id", jobId)
    .select("id");

  if (error) return { error: `更新に失敗しました（${error.message}）` };
  if (!data || data.length === 0) return { error: "更新できませんでした（権限を確認してください）" };

  revalidateJob(jobId);
  return OK;
}

/** 印刷開始。プリンタを割り当て、担当を自分にする。購入者への通知はDBトリガーが出す。 */
export async function startPrintJobAction(
  _prev: OpsActionState,
  formData: FormData
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };
  if (!printerId) return { error: "プリンタを選んでください" };

  const { user } = await requireAdmin();
  return updateJob(
    jobId,
    { status: "printing", printer_id: printerId, assignee_id: user.id },
    ["queued", "qc_failed", "reprinting"]
  );
}

/** 印刷を中断してキューへ戻す。 */
export async function pausePrintJobAction(
  _prev: OpsActionState,
  formData: FormData
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };
  return updateJob(jobId, { status: "queued" }, ["printing", "reprinting"]);
}

/** バッチを1回ぶん消化する（ベッドに載りきらない作品は何回かに分けて刷る）。 */
export async function advanceBatchAction(
  _prev: OpsActionState,
  formData: FormData
): Promise<OpsActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "ジョブが指定されていません" };

  const { supabase } = await requireAdmin();
  const { data: job } = await supabase
    .from("print_jobs")
    .select("batch_done, batch_count")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "ジョブが見つかりません" };
  if (job.batch_done >= job.batch_count) return { error: "すべてのバッチが終わっています" };

  return updateJob(jobId, { batch_done: job.batch_done + 1 });
}

const finishSchema = z.object({
  actualGrams: z.coerce.number().min(0, "0以上で入力してください").max(20000),
  actualHours: z.coerce.number().min(0, "0以上で入力してください").max(999),
  failureCount: z.coerce.number().int().min(0).max(99),
  filamentId: z.string().uuid().optional().or(z.literal("")),
});

/**
 * 印刷完了（＝検品待ち）にして実績を記録する。
 *
 * 実使用グラムを入れたら、そのぶんフィラメント台帳に消費を積む
 * （`filaments.stock_grams` は台帳の結果。トリガーが減らす）。
 */
export async function finishPrintJobAction(
  _prev: OpsActionState,
  formData: FormData
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
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { actualGrams, actualHours, failureCount, filamentId } = parsed.data;

  const { supabase, user } = await requireAdmin();

  const { data: current } = await supabase
    .from("print_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (!current) return { error: "ジョブが見つかりません" };
  if (current.status !== "printing" && current.status !== "reprinting") {
    return { error: "印刷中のジョブだけ完了にできます" };
  }

  const result = await updateJob(jobId, {
    status: "printed",
    actual_filament_grams: actualGrams,
    actual_print_hours: actualHours,
    failure_count: failureCount,
  });
  if (result.error) return result;

  if (filamentId && actualGrams > 0) {
    const { data, error } = await supabase
      .from("filament_ledger")
      .insert({
        filament_id: filamentId,
        delta_grams: -actualGrams,
        reason: "print",
        print_job_id: jobId,
        actor_id: user.id,
      })
      .select("id");
    if (error || !data || data.length === 0) {
      // ジョブ自体は完了済みなので、ここは戻さず画面に伝えるだけにする
      return { error: null, message: "完了にしましたが、フィラメント台帳への記録に失敗しました" };
    }
  }

  return { error: null, message: "実績を記録して検品待ちにしました" };
}

/** 検品NGのあと、刷り直しを始める。 */
export async function startReprintAction(
  _prev: OpsActionState,
  formData: FormData
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
    ["qc_failed"]
  );
}

const qcSchema = z.object({
  jobId: z.string().uuid(),
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
  formData: FormData
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

  const { supabase, user } = await requireAdmin();

  const { data: job } = await supabase
    .from("print_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "ジョブが見つかりません" };
  if (job.status !== "printed" && job.status !== "qc_failed") {
    return { error: "印刷が終わったジョブだけ検品できます" };
  }

  const { data: definitions } = await supabase
    .from("qc_check_definitions")
    .select("code")
    .eq("is_active", true);

  const results = (definitions ?? []).map((d) => ({
    code: d.code,
    passed: formData.get(`check_${d.code}`) === "pass",
    note: String(formData.get(`note_${d.code}`) ?? "") || null,
  }));

  const unanswered = (definitions ?? []).filter(
    (d) => formData.get(`check_${d.code}`) === null
  );
  if (unanswered.length > 0) {
    return { error: "すべての項目に OK / NG を付けてください" };
  }

  const failed = results.filter((r) => !r.passed);
  const result: QcResult = failed.length === 0 ? "passed" : "failed";
  if (result === "failed" && !reprintCause) {
    return { error: "NG があるときは再印刷の原因を選んでください" };
  }

  const photoPaths = formData
    .getAll("photoPaths")
    .map((v) => String(v))
    .filter(Boolean);

  const { data: inspection, error } = await supabase
    .from("qc_inspections")
    .insert({
      print_job_id: jobId,
      inspector_id: user.id,
      result,
      memo: memo ?? null,
      photo_paths: photoPaths,
      reprint_cause: result === "failed" ? reprintCause! : null,
    })
    .select("id")
    .maybeSingle();

  if (error || !inspection) {
    return { error: `検品結果の登録に失敗しました（${error?.message ?? "0件"}）` };
  }

  const { data: written, error: resultError } = await supabase
    .from("qc_check_results")
    .insert(results.map((r) => ({ inspection_id: inspection.id, ...r })))
    .select("id");

  if (resultError || (written ?? []).length !== results.length) {
    return { error: "チェック項目の記録に失敗しました" };
  }

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
  orderId: z.string().uuid(),
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
  formData: FormData
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
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const v = parsed.data;

  const { supabase, user } = await requireAdmin();

  // 全ジョブが検品を通っていないうちは発送させない
  const { data: jobs } = await supabase
    .from("print_jobs")
    .select("status")
    .eq("order_id", v.orderId);
  const pending = (jobs ?? []).filter(
    (j) => j.status !== "qc_passed" && j.status !== "cancelled"
  );
  if ((jobs ?? []).length === 0 || pending.length > 0) {
    return { error: "検品が終わっていないジョブがあります" };
  }

  const { data, error } = await supabase
    .from("shipments")
    .insert({
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
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: "この注文はすでに発送登録されています" };
    return { error: `発送登録に失敗しました（${error.message}）` };
  }
  if (!data || data.length === 0) return { error: "発送登録に失敗しました" };

  revalidatePath("/admin/print-queue");
  revalidatePath("/mypage/orders");
  return { error: null, message: "発送を登録しました。購入者の注文は「発送済み」になります" };
}

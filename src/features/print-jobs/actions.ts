"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireCreator } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  completePrintJobSchema,
  recordInspectionSchema,
  type CompletePrintJobInput,
  type RecordInspectionInput,
} from "./schema";

/** 印刷を開始する。注文とジョブと明細のステータスを揃える */
export async function startPrintJob(jobId: string): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const { data: job } = await supabase
    .from("print_jobs")
    .select("id, status, order_id, order_item_id")
    .eq("id", jobId)
    .single();
  if (!job) return { ok: false, error: "ジョブが見つかりません" };
  if (job.status !== "queued") {
    return { ok: false, error: "未着手のジョブのみ開始できます" };
  }

  const { error } = await supabase
    .from("print_jobs")
    .update({
      status: "printing",
      started_at: new Date().toISOString(),
      operator_id: user.id,
    })
    .eq("id", jobId);
  if (error) return { ok: false, error: "印刷開始に失敗しました" };

  await supabase
    .from("order_items")
    .update({ item_status: "printing" })
    .eq("id", job.order_item_id);

  // 注文全体はまだ paid のことがあるので、最初のジョブ着手で printing へ送る
  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", job.order_id)
    .single();
  if (order?.status === "paid") {
    await supabase
      .from("orders")
      .update({ status: "printing", printing_at: new Date().toISOString() })
      .eq("id", job.order_id);
    await supabase.from("order_events").insert({
      order_id: job.order_id,
      from_status: "paid",
      to_status: "printing",
      actor_id: user.id,
      reason: "print_job_started",
    });
  }

  revalidatePath("/admin/print-queue");
  revalidatePath(`/admin/print-jobs/${jobId}`);
  return { ok: true, data: undefined };
}

/** 実績（使用フィラメント・実印刷時間）を記録して検品待ちにする */
export async function completePrintJob(
  input: CompletePrintJobInput
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = completePrintJobSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: job } = await supabase
    .from("print_jobs")
    .select("id, status, order_item_id")
    .eq("id", v.jobId)
    .single();
  if (!job) return { ok: false, error: "ジョブが見つかりません" };
  if (job.status !== "printing") {
    return { ok: false, error: "印刷中のジョブのみ完了にできます" };
  }

  const { error } = await supabase
    .from("print_jobs")
    .update({
      status: "inspection",
      printed_at: new Date().toISOString(),
      actual_weight_g: v.actualWeightG,
      actual_print_min: v.actualPrintMin,
      actual_filament_id: v.actualFilamentId ?? null,
      note: v.note ?? null,
    })
    .eq("id", v.jobId);
  if (error) return { ok: false, error: "印刷完了の記録に失敗しました" };

  await supabase
    .from("order_items")
    .update({ item_status: "printed", printed_at: new Date().toISOString() })
    .eq("id", job.order_item_id);

  revalidatePath("/admin/print-queue");
  revalidatePath(`/admin/print-jobs/${v.jobId}`);
  return { ok: true, data: undefined };
}

/**
 * 検品結果を記録する。
 *   pass        … 完了。発送登録へ進める
 *   fail_model  … モデル側の問題。クリエイターへ修正依頼を飛ばす
 *   fail_print  … 印刷側の問題。同じジョブを未着手に戻して刷り直す
 */
export async function recordInspection(
  input: RecordInspectionInput
): Promise<ActionResult<{ result: string }>> {
  const { supabase, user } = await requireAdmin();

  const parsed = recordInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力エラー",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const v = parsed.data;

  const { data: job } = await supabase
    .from("print_jobs")
    .select("id, status, product_id, creator_id, order_item_id")
    .eq("id", v.jobId)
    .single();
  if (!job) return { ok: false, error: "ジョブが見つかりません" };
  if (job.status !== "inspection") {
    return { ok: false, error: "検品待ちのジョブのみ検品できます" };
  }

  const { error: insError } = await supabase.from("print_job_inspections").insert({
    job_id: v.jobId,
    inspector_id: user.id,
    result: v.result,
    checks: v.checks,
    comment: v.comment ?? null,
  });
  if (insError) return { ok: false, error: "検品結果の保存に失敗しました" };

  const nextStatus =
    v.result === "pass" ? "done" : v.result === "fail_print" ? "queued" : "failed";

  const { error } = await supabase
    .from("print_jobs")
    .update({
      status: nextStatus,
      inspected_at: new Date().toISOString(),
      // 刷り直しは実績を持ち越さない
      ...(v.result === "fail_print"
        ? { started_at: null, printed_at: null, actual_weight_g: null, actual_print_min: null }
        : {}),
    })
    .eq("id", v.jobId);
  if (error) return { ok: false, error: "ジョブの更新に失敗しました" };

  if (v.result === "fail_print") {
    await supabase
      .from("order_items")
      .update({ item_status: "printing" })
      .eq("id", job.order_item_id);
  }

  if (v.result === "fail_model") {
    const { error: fixError } = await supabase.from("product_fix_requests").insert({
      product_id: job.product_id,
      creator_id: job.creator_id,
      job_id: job.id,
      reason: "検品で「モデル側の問題」と判定されました",
      inspector_comment: v.comment ?? null,
      reprint_fee: v.reprintFee ?? 0,
    });
    if (fixError) {
      return { ok: false, error: "修正依頼の作成に失敗しました" };
    }
  }

  revalidatePath("/admin/print-queue");
  revalidatePath(`/admin/print-jobs/${v.jobId}`);
  return { ok: true, data: { result: v.result } };
}

/** クリエイターが修正依頼を「対応済み」にする */
export async function resolveFixRequest(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const { error } = await supabase
    .from("product_fix_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("creator_id", user.id);
  if (error) return { ok: false, error: "更新に失敗しました" };

  revalidatePath("/studio/fix-requests");
  revalidatePath(`/studio/fix-requests/${id}`);
  return { ok: true, data: undefined };
}

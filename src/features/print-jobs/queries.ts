import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export type PrintJobStatus = Database["public"]["Enums"]["print_job_status"];

export const JOB_STATUS_LABEL: Record<PrintJobStatus, string> = {
  queued: "未着手",
  printing: "印刷中",
  inspection: "検品待ち",
  done: "完了",
  failed: "要対応",
};

/** 印刷キュー一覧（Figma 2079:1163） */
export async function listPrintJobs(status?: PrintJobStatus) {
  const supabase = await createClient();
  let query = supabase
    .from("print_jobs")
    .select(
      `id, status, due_at, est_weight_g, est_print_min, part_count, created_at,
       nui_sizes(label),
       products(title, slug),
       order_items(quantity, filament_name, filament_color_hex, nui_size_label),
       orders(order_number),
       profiles!print_jobs_creator_id_fkey(display_name, handle)`
    )
    .order("due_at", { ascending: true });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** キュー上部のサマリ。期限超過は「完了以外で due_at を過ぎたもの」 */
export async function getPrintQueueSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("status, due_at");
  if (error) throw error;

  const now = Date.now();
  return {
    queued: data.filter((j) => j.status === "queued").length,
    printing: data.filter((j) => j.status === "printing").length,
    inspection: data.filter((j) => j.status === "inspection").length,
    overdue: data.filter(
      (j) =>
        j.status !== "done" &&
        j.due_at != null &&
        new Date(j.due_at).getTime() < now
    ).length,
  };
}

/**
 * ジョブ詳細（Figma 2080:1219）。
 * STEP2 でクリエイターが入力した印刷指示をパーツごとに読み出す。
 */
export async function getPrintJob(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select(
      `*,
       nui_sizes(label),
       products(id, title, slug, print_note, size_w_mm, size_d_mm, size_h_mm,
                product_assets(id, original_name, part_label, quantity_per_item, sort_order,
                               layer_direction, support_type, color_slot, print_note,
                               filaments(name, color_hex, material))),
       order_items(id, quantity, filament_name, filament_color_hex, nui_size_label, unit_price),
       orders(id, order_number, status, ship_recipient_name, ship_prefecture, ship_city),
       profiles!print_jobs_creator_id_fkey(display_name, handle),
       print_job_inspections(id, result, checks, comment, created_at)`
    )
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

/** クリエイター向け: 自分に届いている修正依頼 */
export async function listMyFixRequests(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_fix_requests")
    .select(
      `id, status, reason, inspector_comment, photo_url, reprint_fee, created_at, resolved_at,
       products(id, slug, title),
       print_jobs(id, nui_sizes(label))`
    )
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyFixRequest(id: string, creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_fix_requests")
    .select(
      `id, status, reason, inspector_comment, photo_url, reprint_fee, created_at, resolved_at,
       products(id, slug, title,
                product_asset_validations(asset_id, passed, checks, triangle_count,
                                          bbox_w_mm, bbox_d_mm, bbox_h_mm, shell_count)),
       print_jobs(id, actual_weight_g, actual_print_min, nui_sizes(label))`
    )
    .eq("id", id)
    .eq("creator_id", creatorId)
    .single();
  if (error) return null;
  return data;
}

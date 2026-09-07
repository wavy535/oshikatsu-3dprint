import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { QUEUE_STATUS_FILTERS } from "@/lib/ops/labels";
import type { FilamentMaterial, PrintJobStatus } from "@/types/db";

export type QueueSearchParams = {
  status?: string;
  material?: string;
  printer?: string;
  q?: string;
};

/**
 * 印刷キューの一覧。
 *
 * 表示に要るものは 0014 で `print_queue` ビューに足してある。ここで join を
 * 組み直さないこと（素材・色は「代表スロット = slot_index が最小」という決めが
 * ビュー側に入っている）。
 */
export async function listPrintQueue(params: QueueSearchParams) {
  const { supabase } = await requireAdmin();

  let query = supabase.from("print_queue").select("*");

  const filter = QUEUE_STATUS_FILTERS.find((f) => f.value === params.status)
    ?? QUEUE_STATUS_FILTERS[0];
  if (filter.statuses.length > 0) {
    query = query.in("status", filter.statuses as unknown as PrintJobStatus[]);
  }
  if (params.material) query = query.eq("material", params.material as FilamentMaterial);
  if (params.printer) query = query.eq("printer_code", params.printer);
  if (params.q) {
    const like = `%${params.q}%`;
    query = query.or(`job_no.ilike.${like},work_title.ilike.${like}`);
  }

  // 期限の近いものから。期限なし（想定外）は最後に回す
  const { data } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("job_no", { ascending: true });

  return data ?? [];
}

export type QueueRow = Awaited<ReturnType<typeof listPrintQueue>>[number];

/**
 * キュー上部の4枚（未着手・印刷中・検品待ち・期限超過）。
 * 絞り込みに関係なく全体の状況を出したいので、一覧とは別に取る。
 */
export async function getQueueSummary() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("print_queue")
    .select("status, due_at, is_overdue, est_print_hours");

  const rows = data ?? [];
  const within24h = (v: string | null) =>
    v !== null && new Date(v).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const queued = rows.filter((r) => r.status === "queued");
  const printing = rows.filter((r) => r.status === "printing" || r.status === "reprinting");
  const waitingQc = rows.filter((r) => r.status === "printed");
  const overdue = rows.filter((r) => r.is_overdue);

  return {
    queued: queued.length,
    queuedDueSoon: queued.filter((r) => within24h(r.due_at)).length,
    printing: printing.length,
    printingHours: printing.reduce((sum, r) => sum + Number(r.est_print_hours ?? 0), 0),
    waitingQc: waitingQc.length,
    waitingQcDueSoon: waitingQc.filter((r) => within24h(r.due_at)).length,
    overdue: overdue.length,
  };
}

/** 絞り込みのプルダウンに出す選択肢（実データにあるものだけ出す）。 */
export async function getQueueFilterOptions() {
  const { supabase } = await requireAdmin();
  const [{ data: materials }, { data: printers }] = await Promise.all([
    supabase.from("print_queue").select("material"),
    supabase.from("printers").select("code, model_name, is_active").order("code"),
  ]);

  return {
    materials: [...new Set((materials ?? []).map((m) => m.material).filter(Boolean))] as string[],
    printers: printers ?? [],
  };
}

/**
 * ジョブ詳細。
 *
 * 印刷指示と色スロットは「クリエイターが STEP2 で入れたもの」をそのまま出す。
 * 運営がここで書き換えられるのは実績（実使用グラム・時間・失敗回数）と
 * プリンタの割り当てだけ。
 */
export async function getPrintJob(jobId: string) {
  const { supabase } = await requireAdmin();

  const { data: job } = await supabase
    .from("print_queue")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const [{ data: detail }, { data: events }, { data: printers }, { data: filaments }] =
    await Promise.all([
      supabase
        .from("print_jobs")
        .select("print_fee_snapshot, started_at, finished_at, order_item_id")
        .eq("id", jobId)
        .maybeSingle(),
      supabase
        .from("print_job_events")
        .select("id, status, note, created_at")
        .eq("print_job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase.from("printers").select("id, code, model_name, supports_multicolor").eq("is_active", true).order("code"),
      supabase.from("filaments").select("id, material, color_name, color_hex, stock_grams").eq("is_active", true).order("material").order("color_name"),
    ]);

  const workId = job.work_id;
  const [{ data: work }, { data: variant }, { data: slots }, { data: instructions }] =
    await Promise.all([
      workId
        ? supabase
            .from("works")
            .select("id, title, creator_id, profiles!works_creator_id_fkey(display_name)")
            .eq("id", workId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      job.variant_id
        ? supabase
            .from("work_variants")
            .select("bbox_x_mm, bbox_y_mm, bbox_z_mm, est_filament_grams, est_print_hours")
            .eq("id", job.variant_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      workId
        ? supabase
            .from("work_color_slots")
            .select(
              "slot_index, source_name, source_hex, filaments(id, material, color_name, color_hex, stock_grams)"
            )
            .eq("work_id", workId)
            .order("slot_index")
        : Promise.resolve({ data: [] }),
      workId
        ? supabase
            .from("work_part_instructions")
            .select(
              "id, variant_id, orientation, support, support_note, note, work_asset_objects(name, object_index, bbox_x_mm, bbox_y_mm, bbox_z_mm, min_wall_thickness_mm)"
            )
            .eq("work_id", workId)
        : Promise.resolve({ data: [] }),
    ]);

  // 指示はサイズ別に上書きできる（variant_id 付きが優先、無ければ共通）
  const parts = (instructions ?? [])
    .filter((i) => i.variant_id === null || i.variant_id === job.variant_id)
    .sort(
      (a, b) =>
        (a.work_asset_objects?.object_index ?? 0) - (b.work_asset_objects?.object_index ?? 0)
    );
  const overridden = new Set(
    parts.filter((p) => p.variant_id !== null).map((p) => p.work_asset_objects?.name)
  );

  return {
    job,
    detail,
    events: events ?? [],
    printers: printers ?? [],
    filaments: filaments ?? [],
    work,
    variant,
    slots: slots ?? [],
    parts: parts.filter((p) => p.variant_id !== null || !overridden.has(p.work_asset_objects?.name)),
  };
}

/**
 * 検品・発送登録の画面が読むもの。
 *
 * 発送は1注文1件（同梱前提）なので、同じ注文の他のジョブが検品を通っているかを
 * ここで見て、発送登録を出すかどうかを決める。
 */
export async function getQcContext(jobId: string) {
  const { supabase } = await requireAdmin();

  const { data: job } = await supabase
    .from("print_queue")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const [{ data: checks }, { data: inspections }, { data: order }, { data: siblings }, { data: shipment }] =
    await Promise.all([
      supabase
        .from("qc_check_definitions")
        .select("code, label, description, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("qc_inspections")
        .select(
          "id, result, memo, photo_paths, reprint_cause, created_at, qc_check_results(code, passed, note)"
        )
        .eq("print_job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select(
          `id, status, total_amount, gift_wrapping, ship_due_at, created_at, tracking_number,
           addresses(recipient_name, postal_code, prefecture, city, address_line, phone),
           profiles!orders_buyer_id_fkey(display_name)`
        )
        .eq("id", job.order_id!)
        .maybeSingle(),
      supabase
        .from("print_queue")
        .select("id, job_no, status, work_title, size_label, quantity")
        .eq("order_id", job.order_id!)
        .order("job_no"),
      supabase
        .from("shipments")
        .select("id, carrier, service_name, tracking_number, weight_grams, size_sum_cm, shipping_fee_jpy, shipped_at")
        .eq("order_id", job.order_id!)
        .maybeSingle(),
    ]);

  const others = (siblings ?? []).filter((s) => s.id !== jobId);
  const allPassed =
    (siblings ?? []).length > 0 &&
    (siblings ?? []).every((s) => s.status === "qc_passed" || s.status === "cancelled");

  return {
    job,
    checks: checks ?? [],
    inspections: inspections ?? [],
    order,
    siblings: others,
    allPassed,
    shipment,
  };
}

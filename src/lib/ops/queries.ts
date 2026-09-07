import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import {
  monthKey,
  ORDER_STATUS_FILTERS,
  QUEUE_STATUS_FILTERS,
  SALES_ORDER_STATUSES,
} from "@/lib/ops/labels";
import type {
  Database,
  FilamentMaterial,
  OrderStatus,
  PrintJobStatus,
  ShippingCarrier,
} from "@/types/db";

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

// =============================================================================
// 注文一覧・注文詳細
// =============================================================================

export type OrderSearchParams = { status?: string; q?: string };

const ORDER_LIST_SELECT = `id, status, subtotal_amount, print_cost_amount, shipping_fee_amount,
  total_amount, ship_due_at, gift_wrapping, created_at,
  profiles!orders_buyer_id_fkey(display_name),
  order_items(id, quantity, size_label_snapshot, works(title)),
  print_jobs(id, job_no, status),
  shipments(tracking_number, shipped_at)`;

/**
 * 注文一覧。ステータスの束ね方は ORDER_STATUS_FILTERS。
 * 検索（購入者名・作品名）は入れ子の関係に対して PostgREST の or() が使えないので、
 * 取ってから絞る（運営の件数規模なら問題にならない）。
 */
export async function listOrders(params: OrderSearchParams) {
  const { supabase } = await requireAdmin();

  let query = supabase.from("orders").select(ORDER_LIST_SELECT);
  const filter =
    ORDER_STATUS_FILTERS.find((f) => f.value === params.status) ?? ORDER_STATUS_FILTERS[0];
  if (filter.statuses.length > 0) {
    query = query.in("status", filter.statuses as unknown as OrderStatus[]);
  }

  const { data } = await query.order("created_at", { ascending: false });
  const rows = data ?? [];
  if (!params.q) return rows;

  const q = params.q.toLowerCase();
  return rows.filter(
    (o) =>
      o.id.startsWith(q) ||
      (o.profiles?.display_name ?? "").toLowerCase().includes(q) ||
      o.order_items.some((i) => (i.works?.title ?? "").toLowerCase().includes(q)) ||
      o.print_jobs.some((j) => (j.job_no ?? "").toLowerCase().includes(q))
  );
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number];

/** 注文一覧の上の4枚。絞り込みに関係なく全体を出す。 */
export async function getOrderSummary() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("orders").select("status, ship_due_at, created_at");
  const rows = data ?? [];
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const open = rows.filter((o) =>
    ["paid", "printing_queued", "printing", "packaging"].includes(o.status)
  );
  return {
    open: open.length,
    packaging: rows.filter((o) => o.status === "packaging").length,
    overdue: open.filter((o) => o.ship_due_at && new Date(o.ship_due_at).getTime() < now).length,
    today: rows.filter((o) => new Date(o.created_at) >= dayStart).length,
  };
}

/**
 * 運営向けの注文詳細。購入者のマイページとは別に、明細ごとの手数料・受取額と
 * 印刷ジョブ・発送記録まで一枚で見る。
 */
export async function getOrderForAdmin(orderId: string) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("orders")
    .select(
      `id, status, subtotal_amount, platform_fee_amount, print_cost_amount, shipping_fee_amount,
       total_amount, ship_due_at, gift_wrapping, created_at, shipped_at, tracking_number,
       profiles!orders_buyer_id_fkey(display_name),
       addresses(recipient_name, postal_code, prefecture, city, address_line, phone),
       order_items(id, quantity, unit_price, size_label_snapshot, platform_fee_amount,
         creator_payout_amount, print_cost_amount, works(id, title),
         profiles!order_items_creator_id_fkey(display_name)),
       print_jobs(id, job_no, status, due_at, printer_id, actual_filament_grams, actual_print_hours),
       shipments(id, carrier, service_name, tracking_number, box_type, weight_grams, size_sum_cm,
         shipping_fee_jpy, shipped_at)`
    )
    .eq("id", orderId)
    .maybeSingle();
  return data;
}

// =============================================================================
// 出荷済み
// =============================================================================

export type ShipmentSearchParams = { carrier?: string; q?: string };

export async function listShipments(params: ShipmentSearchParams) {
  const { supabase } = await requireAdmin();

  let query = supabase.from("shipments").select(
    `id, carrier, service_name, tracking_number, box_type, weight_grams, size_sum_cm,
     shipping_fee_jpy, shipped_at,
     profiles!shipments_packer_id_fkey(display_name),
     orders(id, status, created_at, shipping_fee_amount, total_amount,
       profiles!orders_buyer_id_fkey(display_name),
       addresses(prefecture, city),
       order_items(quantity, size_label_snapshot, works(title)))`
  );
  if (params.carrier) query = query.eq("carrier", params.carrier as ShippingCarrier);

  const { data } = await query.order("shipped_at", { ascending: false });
  const rows = data ?? [];
  if (!params.q) return rows;

  const q = params.q.toLowerCase();
  return rows.filter(
    (s) =>
      (s.tracking_number ?? "").toLowerCase().includes(q) ||
      (s.orders?.profiles?.display_name ?? "").toLowerCase().includes(q) ||
      (s.orders?.order_items ?? []).some((i) => (i.works?.title ?? "").toLowerCase().includes(q))
  );
}

export type ShipmentRow = Awaited<ReturnType<typeof listShipments>>[number];

/** 出荷済みの上の4枚。リードタイムは受注から発送までの日数。 */
export async function getShipmentSummary() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("shipments")
    .select("shipped_at, shipping_fee_jpy, orders(created_at, shipping_fee_amount)");
  const rows = data ?? [];

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const leadDays = rows
    .filter((s) => s.orders?.created_at)
    .map(
      (s) =>
        (new Date(s.shipped_at).getTime() - new Date(s.orders!.created_at).getTime()) / 86_400_000
    );
  return {
    today: rows.filter((s) => new Date(s.shipped_at) >= dayStart).length,
    week: rows.filter((s) => new Date(s.shipped_at) >= weekStart).length,
    total: rows.length,
    avgLeadDays: leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null,
    // 購入者からもらった送料と、運営が払った実費の差
    shippingBalance: rows.reduce(
      (n, s) => n + (s.orders?.shipping_fee_amount ?? 0) - (s.shipping_fee_jpy ?? 0),
      0
    ),
  };
}

// =============================================================================
// フィラメント在庫
// =============================================================================

/**
 * 在庫一覧。数字は3つの出どころから組む:
 *   在庫       … filaments.stock_grams（台帳の結果。トリガーが更新）
 *   予定消費   … 作業中ジョブの推定グラム（代表スロットの素材・色で束ねる）
 *   30日の消費 … filament_ledger の reason='print'
 */
export async function listFilamentStock() {
  const { supabase } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: filaments }, { data: openJobs }, { data: recent }, { data: slots }] =
    await Promise.all([
      supabase
        .from("filaments")
        .select("id, material, color_name, color_hex, stock_grams, price_per_gram, is_active")
        .order("material")
        .order("color_name"),
      supabase
        .from("print_queue")
        .select("material, color_name, est_filament_grams")
        .in("status", ["queued", "printing", "reprinting", "qc_failed"]),
      supabase
        .from("filament_ledger")
        .select("filament_id, delta_grams, reason")
        .gte("created_at", since),
      supabase.from("work_color_slots").select("filament_id"),
    ]);

  const planned = new Map<string, number>();
  for (const j of openJobs ?? []) {
    const key = `${j.material}/${j.color_name}`;
    planned.set(key, (planned.get(key) ?? 0) + Number(j.est_filament_grams ?? 0));
  }
  const used30 = new Map<string, number>();
  for (const l of recent ?? []) {
    if (l.reason !== "print") continue;
    used30.set(l.filament_id, (used30.get(l.filament_id) ?? 0) - Number(l.delta_grams));
  }
  const workCount = new Map<string, number>();
  for (const s of slots ?? []) {
    if (s.filament_id) workCount.set(s.filament_id, (workCount.get(s.filament_id) ?? 0) + 1);
  }

  return (filaments ?? []).map((f) => ({
    ...f,
    plannedGrams: planned.get(`${f.material}/${f.color_name}`) ?? 0,
    used30Grams: used30.get(f.id) ?? 0,
    workCount: workCount.get(f.id) ?? 0,
  }));
}

export type FilamentStockRow = Awaited<ReturnType<typeof listFilamentStock>>[number];

/** 台帳の直近の動き。 */
export async function listFilamentLedger(limit = 30) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("filament_ledger")
    .select(
      `id, delta_grams, reason, created_at,
       filaments(material, color_name, color_hex),
       print_jobs(id, job_no),
       profiles!filament_ledger_actor_id_fkey(display_name)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// =============================================================================
// 売上・手数料
// =============================================================================

/**
 * 売上の集計。運営の決め（2026-09-08）:
 *
 *   手数料 = (購入者の支払い − 印刷の実費 − 送料の実費) × 料率（20%）
 *   クリエイター受取 = 残り
 *
 * 式は DB の `order_settlements` ビュー（0016）だけが持つ。発送が終わって実費が
 * そろった注文は「確定」、それまでは請求した代行費・購入者負担の送料で「見込み」。
 * 料率は注文ごとのスナップショット（orders.platform_fee_rate）なので、
 * 料率を変えても過去の注文の精算は動かない。
 */
export type Settlement = {
  orderId: string;
  status: OrderStatus;
  orderedAt: string;
  rate: number;
  gross: number;
  goods: number;
  printFee: number;
  printActual: number | null;
  shippingCharged: number;
  shippingActual: number | null;
  printUsed: number;
  shippingUsed: number;
  pool: number;
  fee: number;
  payout: number;
  isFinal: boolean;
};

type SettlementRow = Database["public"]["Views"]["order_settlements"]["Row"];

function toSettlement(r: SettlementRow): Settlement {
  return {
    orderId: r.order_id!,
    status: r.status!,
    orderedAt: r.ordered_at!,
    rate: Number(r.platform_fee_rate ?? 0),
    gross: r.gross_amount ?? 0,
    goods: r.goods_amount ?? 0,
    printFee: r.print_fee_amount ?? 0,
    printActual: r.print_actual_amount,
    shippingCharged: r.shipping_charged_amount ?? 0,
    shippingActual: r.shipping_actual_amount,
    printUsed: r.print_cost_used ?? 0,
    shippingUsed: r.shipping_used ?? 0,
    pool: r.pool_amount ?? 0,
    fee: r.fee_amount ?? 0,
    payout: r.payout_amount ?? 0,
    isFinal: !!r.is_final,
  };
}

export async function getOrderSettlement(orderId: string) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("order_settlements")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  return data ? toSettlement(data) : null;
}

export async function getSales(month: string | "all") {
  const { supabase } = await requireAdmin();

  let from: string | null = null;
  let to: string | null = null;
  if (month !== "all") {
    const [y, m] = month.split("-").map(Number);
    from = new Date(y, m - 1, 1).toISOString();
    to = new Date(y, m, 1).toISOString();
  }

  let settlementsQuery = supabase
    .from("order_settlements")
    .select("*")
    .in("status", [...SALES_ORDER_STATUSES]);
  if (from && to) settlementsQuery = settlementsQuery.gte("ordered_at", from).lt("ordered_at", to);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [{ data: rows }, { data: trendRows }, { data: payouts }, { data: rule }] =
    await Promise.all([
      settlementsQuery.order("ordered_at", { ascending: false }),
      supabase
        .from("order_settlements")
        .select("ordered_at, pool_amount, fee_amount, is_final")
        .in("status", [...SALES_ORDER_STATUSES])
        .gte("ordered_at", sixMonthsAgo.toISOString()),
      supabase.from("payout_requests").select("creator_id, amount, status"),
      supabase
        .from("print_pricing_rules")
        .select("platform_fee_rate")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  const settlements = (rows ?? []).map(toSettlement);
  const orderIds = settlements.map((s) => s.orderId);
  type SalesItem = {
    order_id: string;
    creator_id: string;
    quantity: number;
    unit_price: number;
    profiles: { display_name: string } | null;
  };
  let items: SalesItem[] = [];
  if (orderIds.length) {
    const { data } = await supabase
      .from("order_items")
      .select("order_id, creator_id, quantity, unit_price, profiles!order_items_creator_id_fkey(display_name)")
      .in("order_id", orderIds);
    items = data ?? [];
  }

  const sum = (pick: (s: Settlement) => number | null) =>
    settlements.reduce((n, s) => n + (pick(s) ?? 0), 0);

  const totals = {
    orders: settlements.length,
    finalCount: settlements.filter((s) => s.isFinal).length,
    gross: sum((s) => s.gross),
    goods: sum((s) => s.goods),
    printFee: sum((s) => s.printFee),
    printUsed: sum((s) => s.printUsed),
    shippingCharged: sum((s) => s.shippingCharged),
    shippingUsed: sum((s) => s.shippingUsed),
    pool: sum((s) => s.pool),
    fee: sum((s) => s.fee),
    payout: sum((s) => s.payout),
  };

  // クリエイター別。精算は注文単位なので、明細の作品代金の割合で配る
  // （端数は最後の明細に寄せて、注文の合計と食い違わないようにする）
  const byOrder = new Map(settlements.map((s) => [s.orderId, s]));
  const itemsByOrder = new Map<string, SalesItem[]>();
  for (const i of items) {
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  }
  const byCreator = new Map<
    string,
    { creatorId: string; name: string; orders: Set<string>; goods: number; fee: number; payout: number }
  >();
  for (const [orderId, list] of itemsByOrder) {
    const s = byOrder.get(orderId);
    if (!s || s.goods === 0) continue;
    let feeLeft = s.fee;
    let payoutLeft = s.payout;
    list.forEach((i, idx) => {
      const goods = i.unit_price * i.quantity;
      const last = idx === list.length - 1;
      const fee = last ? feeLeft : Math.round((s.fee * goods) / s.goods);
      const payout = last ? payoutLeft : Math.round((s.payout * goods) / s.goods);
      feeLeft -= fee;
      payoutLeft -= payout;

      const row = byCreator.get(i.creator_id) ?? {
        creatorId: i.creator_id,
        name: i.profiles?.display_name ?? "—",
        orders: new Set<string>(),
        goods: 0,
        fee: 0,
        payout: 0,
      };
      row.orders.add(orderId);
      row.goods += goods;
      row.fee += fee;
      row.payout += payout;
      byCreator.set(i.creator_id, row);
    });
  }
  const paidOut = new Map<string, number>();
  const requested = new Map<string, number>();
  for (const p of payouts ?? []) {
    if (p.status === "paid") paidOut.set(p.creator_id, (paidOut.get(p.creator_id) ?? 0) + p.amount);
    if (p.status === "requested" || p.status === "processing") {
      requested.set(p.creator_id, (requested.get(p.creator_id) ?? 0) + p.amount);
    }
  }
  const creators = [...byCreator.values()]
    .map((c) => ({
      ...c,
      orderCount: c.orders.size,
      paidOut: paidOut.get(c.creatorId) ?? 0,
      requested: requested.get(c.creatorId) ?? 0,
    }))
    .sort((a, b) => b.goods - a.goods);

  // 月別（直近6か月）
  const trend = new Map<string, { pool: number; fee: number; count: number; finalCount: number }>();
  for (let k = 0; k < 6; k++) {
    const d = new Date(sixMonthsAgo);
    d.setMonth(d.getMonth() + k);
    trend.set(monthKey(d), { pool: 0, fee: 0, count: 0, finalCount: 0 });
  }
  for (const r of trendRows ?? []) {
    const t = trend.get(monthKey(new Date(r.ordered_at!)));
    if (!t) continue;
    t.pool += r.pool_amount ?? 0;
    t.fee += r.fee_amount ?? 0;
    t.count += 1;
    if (r.is_final) t.finalCount += 1;
  }

  return {
    totals,
    creators,
    settlements,
    trend: [...trend.entries()].map(([key, v]) => ({ key, ...v })),
    feeRate: Number(rule?.platform_fee_rate ?? 0),
  };
}

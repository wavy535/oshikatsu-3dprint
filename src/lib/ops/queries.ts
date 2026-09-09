import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import { sql } from "kysely";
import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import {
  monthKey,
  ORDER_STATUS_FILTERS,
  QUEUE_STATUS_FILTERS,
  SALES_ORDER_STATUSES,
} from "@/lib/ops/labels";
import type {
  Tables,
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
 * 表示に要るものは `print_queue` ビューに揃えてある。ここで join を
 * 組み直さないこと（素材・色は「代表スロット = slot_index が最小」という決めが
 * ビュー側に入っている）。
 */
export async function listPrintQueue(params: QueueSearchParams) {
  const { db } = await requireAdmin();

  let query = db.selectFrom("print_queue").selectAll("print_queue");

  const filter =
    QUEUE_STATUS_FILTERS.find((f) => f.value === params.status) ??
    QUEUE_STATUS_FILTERS[0];
  if (filter.statuses.length > 0) {
    query = query.where(
      sql<boolean>`${sql.ref("print_queue.status")} = any(${filter.statuses as unknown as PrintJobStatus[]})`,
    );
  }
  if (params.material)
    query = query.where(
      "print_queue.material",
      "=",
      params.material as FilamentMaterial,
    );
  if (params.printer)
    query = query.where("print_queue.printer_code", "=", params.printer);
  if (params.q) {
    const like = `%${params.q}%`;
    query = query.where((eb) =>
      eb.or([eb("job_no", "ilike", like), eb("work_title", "ilike", like)]),
    );
  }

  // 期限の近いものから。期限なし（想定外）は最後に回す
  const { data } = await queryResult(
    query
      .orderBy("print_queue.due_at", (order) => order.asc().nullsLast())
      .orderBy("print_queue.job_no", "asc")
      .execute(),
  );

  return data ?? [];
}

export type QueueRow = Awaited<ReturnType<typeof listPrintQueue>>[number];

/**
 * キュー上部の4枚（未着手・印刷中・検品待ち・期限超過）。
 * 絞り込みに関係なく全体の状況を出したいので、一覧とは別に取る。
 */
export async function getQueueSummary() {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("print_queue")
      .select([
        "print_queue.status",
        "print_queue.due_at",
        "print_queue.is_overdue",
        "print_queue.est_print_hours",
      ])
      .execute(),
  );

  const rows = data ?? [];
  const within24h = (v: string | null) =>
    v !== null && new Date(v).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const queued = rows.filter((r) => r.status === "queued");
  const printing = rows.filter(
    (r) => r.status === "printing" || r.status === "reprinting",
  );
  const waitingQc = rows.filter((r) => r.status === "printed");
  const overdue = rows.filter((r) => r.is_overdue);

  return {
    queued: queued.length,
    queuedDueSoon: queued.filter((r) => within24h(r.due_at)).length,
    printing: printing.length,
    printingHours: printing.reduce(
      (sum, r) => sum + Number(r.est_print_hours ?? 0),
      0,
    ),
    waitingQc: waitingQc.length,
    waitingQcDueSoon: waitingQc.filter((r) => within24h(r.due_at)).length,
    overdue: overdue.length,
  };
}

/** 絞り込みのプルダウンに出す選択肢（実データにあるものだけ出す）。 */
export async function getQueueFilterOptions() {
  const { db } = await requireAdmin();
  const [{ data: materials }, { data: printers }] = await Promise.all([
    queryResult(
      db.selectFrom("print_queue").select(["print_queue.material"]).execute(),
    ),
    queryResult(
      db
        .selectFrom("printers")
        .select(["printers.code", "printers.model_name", "printers.is_active"])
        .orderBy("printers.code", "asc")
        .execute(),
    ),
  ]);

  return {
    materials: [
      ...new Set((materials ?? []).map((m) => m.material).filter(Boolean)),
    ] as string[],
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
  const { db } = await requireAdmin();

  const { data: job } = await queryResult(
    db
      .selectFrom("print_queue")
      .selectAll("print_queue")
      .where("print_queue.id", "=", jobId)
      .executeTakeFirst(),
  );
  if (!job) return null;

  const [
    { data: detail },
    { data: events },
    { data: printers },
    { data: filaments },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("print_jobs")
        .select([
          "print_jobs.print_fee_snapshot",
          "print_jobs.started_at",
          "print_jobs.finished_at",
          "print_jobs.order_item_id",
        ])
        .where("print_jobs.id", "=", jobId)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("print_job_events")
        .select([
          "print_job_events.id",
          "print_job_events.status",
          "print_job_events.note",
          "print_job_events.created_at",
        ])
        .where("print_job_events.print_job_id", "=", jobId)
        .orderBy("print_job_events.created_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("printers")
        .select([
          "printers.id",
          "printers.code",
          "printers.model_name",
          "printers.supports_multicolor",
        ])
        .where("printers.is_active", "=", true)
        .orderBy("printers.code", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("filaments")
        .select([
          "filaments.id",
          "filaments.material",
          "filaments.color_name",
          "filaments.color_hex",
          "filaments.stock_grams",
        ])
        .where("filaments.is_active", "=", true)
        .orderBy("filaments.material", "asc")
        .orderBy("filaments.color_name", "asc")
        .execute(),
    ),
  ]);

  const workId = job.work_id;
  const [
    { data: work },
    { data: variant },
    { data: slots },
    { data: instructions },
  ] = await Promise.all([
    workId
      ? queryResult(
          db
            .selectFrom("works")
            .select((eb) => [
              "works.id",
              "works.title",
              "works.creator_id",
              jsonObjectFrom(
                eb
                  .selectFrom("profiles as r0")
                  .select(["r0.display_name"])
                  .whereRef("r0.id", "=", "works.creator_id"),
              ).as("profiles"),
            ])
            .where("works.id", "=", workId)
            .executeTakeFirst(),
        )
      : Promise.resolve({ data: null }),
    job.variant_id
      ? queryResult(
          db
            .selectFrom("work_variants")
            .select([
              "work_variants.bbox_x_mm",
              "work_variants.bbox_y_mm",
              "work_variants.bbox_z_mm",
              "work_variants.est_filament_grams",
              "work_variants.est_print_hours",
            ])
            .where("work_variants.id", "=", job.variant_id)
            .executeTakeFirst(),
        )
      : Promise.resolve({ data: null }),
    workId
      ? queryResult(
          db
            .selectFrom("work_color_slots")
            .select((eb) => [
              "work_color_slots.slot_index",
              "work_color_slots.source_name",
              "work_color_slots.source_hex",
              jsonObjectFrom(
                eb
                  .selectFrom("filaments as r1")
                  .select([
                    "r1.id",
                    "r1.material",
                    "r1.color_name",
                    "r1.color_hex",
                    "r1.stock_grams",
                  ])
                  .whereRef("r1.id", "=", "work_color_slots.filament_id"),
              ).as("filaments"),
            ])
            .where("work_color_slots.work_id", "=", workId)
            .orderBy("work_color_slots.slot_index", "asc")
            .execute(),
        )
      : Promise.resolve({ data: [] }),
    workId
      ? queryResult(
          db
            .selectFrom("work_part_instructions")
            .select((eb) => [
              "work_part_instructions.id",
              "work_part_instructions.variant_id",
              "work_part_instructions.orientation",
              "work_part_instructions.support",
              "work_part_instructions.support_note",
              "work_part_instructions.note",
              jsonObjectFrom(
                eb
                  .selectFrom("work_asset_objects as r2")
                  .select([
                    "r2.name",
                    "r2.object_index",
                    "r2.bbox_x_mm",
                    "r2.bbox_y_mm",
                    "r2.bbox_z_mm",
                    "r2.min_wall_thickness_mm",
                  ])
                  .whereRef("r2.id", "=", "work_part_instructions.object_id"),
              ).as("work_asset_objects"),
            ])
            .where("work_part_instructions.work_id", "=", workId)
            .execute(),
        )
      : Promise.resolve({ data: [] }),
  ]);

  // 指示はサイズ別に上書きできる（variant_id 付きが優先、無ければ共通）
  const parts = (instructions ?? [])
    .filter((i) => i.variant_id === null || i.variant_id === job.variant_id)
    .sort(
      (a, b) =>
        (a.work_asset_objects?.object_index ?? 0) -
        (b.work_asset_objects?.object_index ?? 0),
    );
  const overridden = new Set(
    parts
      .filter((p) => p.variant_id !== null)
      .map((p) => p.work_asset_objects?.name),
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
    parts: parts.filter(
      (p) =>
        p.variant_id !== null || !overridden.has(p.work_asset_objects?.name),
    ),
  };
}

/**
 * 検品・発送登録の画面が読むもの。
 *
 * 発送は1注文1件（同梱前提）なので、同じ注文の他のジョブが検品を通っているかを
 * ここで見て、発送登録を出すかどうかを決める。
 */
export async function getQcContext(jobId: string) {
  const { db } = await requireAdmin();

  const { data: job } = await queryResult(
    db
      .selectFrom("print_queue")
      .selectAll("print_queue")
      .where("print_queue.id", "=", jobId)
      .executeTakeFirst(),
  );
  if (!job) return null;

  const [
    { data: checks },
    { data: inspections },
    { data: order },
    { data: siblings },
    { data: shipment },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("qc_check_definitions")
        .select([
          "qc_check_definitions.code",
          "qc_check_definitions.label",
          "qc_check_definitions.description",
          "qc_check_definitions.sort_order",
        ])
        .where("qc_check_definitions.is_active", "=", true)
        .orderBy("qc_check_definitions.sort_order", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("qc_inspections")
        .select((eb) => [
          "qc_inspections.id",
          "qc_inspections.result",
          "qc_inspections.memo",
          "qc_inspections.photo_paths",
          "qc_inspections.reprint_cause",
          "qc_inspections.created_at",
          jsonArrayFrom(
            eb
              .selectFrom("qc_check_results as r3")
              .select(["r3.code", "r3.passed", "r3.note"])
              .whereRef("r3.inspection_id", "=", "qc_inspections.id"),
          ).as("qc_check_results"),
        ])
        .where("qc_inspections.print_job_id", "=", jobId)
        .orderBy("qc_inspections.created_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("orders")
        .select((eb) => [
          "orders.id",
          "orders.status",
          "orders.total_amount",
          "orders.gift_wrapping",
          "orders.ship_due_at",
          "orders.created_at",
          "orders.tracking_number",
          jsonObjectFrom(
            eb
              .selectFrom("addresses as r4")
              .select([
                "r4.recipient_name",
                "r4.postal_code",
                "r4.prefecture",
                "r4.city",
                "r4.address_line",
                "r4.phone",
              ])
              .whereRef("r4.id", "=", "orders.shipping_address_id"),
          ).as("addresses"),
          jsonObjectFrom(
            eb
              .selectFrom("profiles as r5")
              .select(["r5.display_name"])
              .whereRef("r5.id", "=", "orders.buyer_id"),
          ).as("profiles"),
        ])
        .where("orders.id", "=", job.order_id!)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("print_queue")
        .select([
          "print_queue.id",
          "print_queue.job_no",
          "print_queue.status",
          "print_queue.work_title",
          "print_queue.size_label",
          "print_queue.quantity",
        ])
        .where("print_queue.order_id", "=", job.order_id!)
        .orderBy("print_queue.job_no", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("shipments")
        .select([
          "shipments.id",
          "shipments.carrier",
          "shipments.service_name",
          "shipments.tracking_number",
          "shipments.weight_grams",
          "shipments.size_sum_cm",
          "shipments.shipping_fee_jpy",
          "shipments.shipped_at",
        ])
        .where("shipments.order_id", "=", job.order_id!)
        .executeTakeFirst(),
    ),
  ]);

  const others = (siblings ?? []).filter((s) => s.id !== jobId);
  const allPassed =
    (siblings ?? []).length > 0 &&
    (siblings ?? []).every(
      (s) => s.status === "qc_passed" || s.status === "cancelled",
    );

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

/**
 * 注文一覧。ステータスの束ね方は ORDER_STATUS_FILTERS。
 * 検索（購入者名・作品名）は取得した一覧に対して、
 * 取ってから絞る（運営の件数規模なら問題にならない）。
 */
export async function listOrders(params: OrderSearchParams) {
  const { db } = await requireAdmin();

  let query = db.selectFrom("orders").select((eb) => [
    "orders.id",
    "orders.status",
    "orders.subtotal_amount",
    "orders.print_cost_amount",
    "orders.shipping_fee_amount",
    "orders.total_amount",
    "orders.ship_due_at",
    "orders.gift_wrapping",
    "orders.created_at",
    jsonObjectFrom(
      eb
        .selectFrom("profiles as r6")
        .select(["r6.display_name"])
        .whereRef("r6.id", "=", "orders.buyer_id"),
    ).as("profiles"),
    jsonArrayFrom(
      eb
        .selectFrom("order_items as r7")
        .select((eb) => [
          "r7.id",
          "r7.quantity",
          "r7.size_label_snapshot",
          jsonObjectFrom(
            eb
              .selectFrom("works as r8")
              .select(["r8.title"])
              .whereRef("r8.id", "=", "r7.work_id"),
          ).as("works"),
        ])
        .whereRef("r7.order_id", "=", "orders.id"),
    ).as("order_items"),
    jsonArrayFrom(
      eb
        .selectFrom("print_jobs as r9")
        .select(["r9.id", "r9.job_no", "r9.status"])
        .whereRef("r9.order_id", "=", "orders.id"),
    ).as("print_jobs"),
    jsonArrayFrom(
      eb
        .selectFrom("shipments as r10")
        .select(["r10.tracking_number", "r10.shipped_at"])
        .whereRef("r10.order_id", "=", "orders.id"),
    ).as("shipments"),
  ]);
  const filter =
    ORDER_STATUS_FILTERS.find((f) => f.value === params.status) ??
    ORDER_STATUS_FILTERS[0];
  if (filter.statuses.length > 0) {
    query = query.where(
      sql<boolean>`${sql.ref("orders.status")} = any(${filter.statuses as unknown as OrderStatus[]})`,
    );
  }

  const { data } = await queryResult(
    query.orderBy("orders.created_at", "desc").execute(),
  );
  const rows = data ?? [];
  if (!params.q) return rows;

  const q = params.q.toLowerCase();
  return rows.filter(
    (o) =>
      o.id.startsWith(q) ||
      (o.profiles?.display_name ?? "").toLowerCase().includes(q) ||
      o.order_items.some((i) =>
        (i.works?.title ?? "").toLowerCase().includes(q),
      ) ||
      o.print_jobs.some((j) => (j.job_no ?? "").toLowerCase().includes(q)),
  );
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number];

/** 注文一覧の上の4枚。絞り込みに関係なく全体を出す。 */
export async function getOrderSummary() {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("orders")
      .select(["orders.status", "orders.ship_due_at", "orders.created_at"])
      .execute(),
  );
  const rows = data ?? [];
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const open = rows.filter((o) =>
    ["paid", "printing_queued", "printing", "packaging"].includes(o.status),
  );
  return {
    open: open.length,
    packaging: rows.filter((o) => o.status === "packaging").length,
    overdue: open.filter(
      (o) => o.ship_due_at && new Date(o.ship_due_at).getTime() < now,
    ).length,
    today: rows.filter((o) => new Date(o.created_at) >= dayStart).length,
  };
}

/**
 * 運営向けの注文詳細。購入者のマイページとは別に、明細ごとの手数料・受取額と
 * 印刷ジョブ・発送記録まで一枚で見る。
 */
export async function getOrderForAdmin(orderId: string) {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("orders")
      .select((eb) => [
        "orders.id",
        "orders.status",
        "orders.subtotal_amount",
        "orders.platform_fee_amount",
        "orders.print_cost_amount",
        "orders.shipping_fee_amount",
        "orders.total_amount",
        "orders.ship_due_at",
        "orders.gift_wrapping",
        "orders.created_at",
        "orders.shipped_at",
        "orders.tracking_number",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r11")
            .select(["r11.display_name"])
            .whereRef("r11.id", "=", "orders.buyer_id"),
        ).as("profiles"),
        jsonObjectFrom(
          eb
            .selectFrom("addresses as r12")
            .select([
              "r12.recipient_name",
              "r12.postal_code",
              "r12.prefecture",
              "r12.city",
              "r12.address_line",
              "r12.phone",
            ])
            .whereRef("r12.id", "=", "orders.shipping_address_id"),
        ).as("addresses"),
        jsonArrayFrom(
          eb
            .selectFrom("order_items as r13")
            .select((eb) => [
              "r13.id",
              "r13.quantity",
              "r13.unit_price",
              "r13.size_label_snapshot",
              "r13.platform_fee_amount",
              "r13.creator_payout_amount",
              "r13.print_cost_amount",
              jsonObjectFrom(
                eb
                  .selectFrom("works as r14")
                  .select(["r14.id", "r14.title"])
                  .whereRef("r14.id", "=", "r13.work_id"),
              ).as("works"),
              jsonObjectFrom(
                eb
                  .selectFrom("profiles as r15")
                  .select(["r15.display_name"])
                  .whereRef("r15.id", "=", "r13.creator_id"),
              ).as("profiles"),
            ])
            .whereRef("r13.order_id", "=", "orders.id"),
        ).as("order_items"),
        jsonArrayFrom(
          eb
            .selectFrom("print_jobs as r16")
            .select([
              "r16.id",
              "r16.job_no",
              "r16.status",
              "r16.due_at",
              "r16.printer_id",
              "r16.actual_filament_grams",
              "r16.actual_print_hours",
            ])
            .whereRef("r16.order_id", "=", "orders.id"),
        ).as("print_jobs"),
        jsonArrayFrom(
          eb
            .selectFrom("shipments as r17")
            .select([
              "r17.id",
              "r17.carrier",
              "r17.service_name",
              "r17.tracking_number",
              "r17.box_type",
              "r17.weight_grams",
              "r17.size_sum_cm",
              "r17.shipping_fee_jpy",
              "r17.shipped_at",
            ])
            .whereRef("r17.order_id", "=", "orders.id"),
        ).as("shipments"),
      ])
      .where("orders.id", "=", orderId)
      .executeTakeFirst(),
  );
  return data;
}

// =============================================================================
// 出荷済み
// =============================================================================

export type ShipmentSearchParams = { carrier?: string; q?: string };

export async function listShipments(params: ShipmentSearchParams) {
  const { db } = await requireAdmin();

  let query = db.selectFrom("shipments").select((eb) => [
    "shipments.id",
    "shipments.carrier",
    "shipments.service_name",
    "shipments.tracking_number",
    "shipments.box_type",
    "shipments.weight_grams",
    "shipments.size_sum_cm",
    "shipments.shipping_fee_jpy",
    "shipments.shipped_at",
    jsonObjectFrom(
      eb
        .selectFrom("profiles as r18")
        .select(["r18.display_name"])
        .whereRef("r18.id", "=", "shipments.packer_id"),
    ).as("profiles"),
    jsonObjectFrom(
      eb
        .selectFrom("orders as r19")
        .select((eb) => [
          "r19.id",
          "r19.status",
          "r19.created_at",
          "r19.shipping_fee_amount",
          "r19.total_amount",
          jsonObjectFrom(
            eb
              .selectFrom("profiles as r20")
              .select(["r20.display_name"])
              .whereRef("r20.id", "=", "r19.buyer_id"),
          ).as("profiles"),
          jsonObjectFrom(
            eb
              .selectFrom("addresses as r21")
              .select(["r21.prefecture", "r21.city"])
              .whereRef("r21.id", "=", "r19.shipping_address_id"),
          ).as("addresses"),
          jsonArrayFrom(
            eb
              .selectFrom("order_items as r22")
              .select((eb) => [
                "r22.quantity",
                "r22.size_label_snapshot",
                jsonObjectFrom(
                  eb
                    .selectFrom("works as r23")
                    .select(["r23.title"])
                    .whereRef("r23.id", "=", "r22.work_id"),
                ).as("works"),
              ])
              .whereRef("r22.order_id", "=", "r19.id"),
          ).as("order_items"),
        ])
        .whereRef("r19.id", "=", "shipments.order_id"),
    ).as("orders"),
  ]);
  if (params.carrier)
    query = query.where(
      "shipments.carrier",
      "=",
      params.carrier as ShippingCarrier,
    );

  const { data } = await queryResult(
    query.orderBy("shipments.shipped_at", "desc").execute(),
  );
  const rows = data ?? [];
  if (!params.q) return rows;

  const q = params.q.toLowerCase();
  return rows.filter(
    (s) =>
      (s.tracking_number ?? "").toLowerCase().includes(q) ||
      (s.orders?.profiles?.display_name ?? "").toLowerCase().includes(q) ||
      (s.orders?.order_items ?? []).some((i) =>
        (i.works?.title ?? "").toLowerCase().includes(q),
      ),
  );
}

export type ShipmentRow = Awaited<ReturnType<typeof listShipments>>[number];

/** 出荷済みの上の4枚。リードタイムは受注から発送までの日数。 */
export async function getShipmentSummary() {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("shipments")
      .select((eb) => [
        "shipments.shipped_at",
        "shipments.shipping_fee_jpy",
        jsonObjectFrom(
          eb
            .selectFrom("orders as r24")
            .select(["r24.created_at", "r24.shipping_fee_amount"])
            .whereRef("r24.id", "=", "shipments.order_id"),
        ).as("orders"),
      ])
      .execute(),
  );
  const rows = data ?? [];

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const leadDays = rows
    .filter((s) => s.orders?.created_at)
    .map(
      (s) =>
        (new Date(s.shipped_at).getTime() -
          new Date(s.orders!.created_at).getTime()) /
        86_400_000,
    );
  return {
    today: rows.filter((s) => new Date(s.shipped_at) >= dayStart).length,
    week: rows.filter((s) => new Date(s.shipped_at) >= weekStart).length,
    total: rows.length,
    avgLeadDays: leadDays.length
      ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length
      : null,
    // 購入者からもらった送料と、運営が払った実費の差
    shippingBalance: rows.reduce(
      (n, s) =>
        n + (s.orders?.shipping_fee_amount ?? 0) - (s.shipping_fee_jpy ?? 0),
      0,
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
  const { db } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [
    { data: filaments },
    { data: openJobs },
    { data: recent },
    { data: slots },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("filaments")
        .select([
          "filaments.id",
          "filaments.material",
          "filaments.color_name",
          "filaments.color_hex",
          "filaments.stock_grams",
          "filaments.price_per_gram",
          "filaments.is_active",
        ])
        .orderBy("filaments.material", "asc")
        .orderBy("filaments.color_name", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_queue")
        .select([
          "print_queue.material",
          "print_queue.color_name",
          "print_queue.est_filament_grams",
        ])
        .where(
          sql<boolean>`${sql.ref("print_queue.status")} = any(${["queued", "printing", "reprinting", "qc_failed"]})`,
        )
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("filament_ledger")
        .select([
          "filament_ledger.filament_id",
          "filament_ledger.delta_grams",
          "filament_ledger.reason",
        ])
        .where("filament_ledger.created_at", ">=", since)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("work_color_slots")
        .select(["work_color_slots.filament_id"])
        .execute(),
    ),
  ]);

  const planned = new Map<string, number>();
  for (const j of openJobs ?? []) {
    const key = `${j.material}/${j.color_name}`;
    planned.set(
      key,
      (planned.get(key) ?? 0) + Number(j.est_filament_grams ?? 0),
    );
  }
  const used30 = new Map<string, number>();
  for (const l of recent ?? []) {
    if (l.reason !== "print") continue;
    used30.set(
      l.filament_id,
      (used30.get(l.filament_id) ?? 0) - Number(l.delta_grams),
    );
  }
  const workCount = new Map<string, number>();
  for (const s of slots ?? []) {
    if (s.filament_id)
      workCount.set(s.filament_id, (workCount.get(s.filament_id) ?? 0) + 1);
  }

  return (filaments ?? []).map((f) => ({
    ...f,
    plannedGrams: planned.get(`${f.material}/${f.color_name}`) ?? 0,
    used30Grams: used30.get(f.id) ?? 0,
    workCount: workCount.get(f.id) ?? 0,
  }));
}

export type FilamentStockRow = Awaited<
  ReturnType<typeof listFilamentStock>
>[number];

/** 台帳の直近の動き。 */
export async function listFilamentLedger(limit = 30) {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("filament_ledger")
      .select((eb) => [
        "filament_ledger.id",
        "filament_ledger.delta_grams",
        "filament_ledger.reason",
        "filament_ledger.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("filaments as r25")
            .select(["r25.material", "r25.color_name", "r25.color_hex"])
            .whereRef("r25.id", "=", "filament_ledger.filament_id"),
        ).as("filaments"),
        jsonObjectFrom(
          eb
            .selectFrom("print_jobs as r26")
            .select(["r26.id", "r26.job_no"])
            .whereRef("r26.id", "=", "filament_ledger.print_job_id"),
        ).as("print_jobs"),
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r27")
            .select(["r27.display_name"])
            .whereRef("r27.id", "=", "filament_ledger.actor_id"),
        ).as("profiles"),
      ])
      .orderBy("filament_ledger.created_at", "desc")
      .limit(limit)
      .execute(),
  );
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
 * 式は DB の `order_settlements` ビューだけが持つ。発送が終わって実費が
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

type SettlementRow = Tables<"order_settlements">;

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
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("order_settlements")
      .selectAll("order_settlements")
      .where("order_settlements.order_id", "=", orderId)
      .executeTakeFirst(),
  );
  return data ? toSettlement(data) : null;
}

export async function getSales(month: string | "all") {
  const { db } = await requireAdmin();

  let from: string | null = null;
  let to: string | null = null;
  if (month !== "all") {
    const [y, m] = month.split("-").map(Number);
    from = new Date(y, m - 1, 1).toISOString();
    to = new Date(y, m, 1).toISOString();
  }

  let settlementsQuery = db
    .selectFrom("order_settlements")
    .selectAll("order_settlements")
    .where(
      sql<boolean>`${sql.ref("order_settlements.status")} = any(${[...SALES_ORDER_STATUSES]})`,
    );
  if (from && to)
    settlementsQuery = settlementsQuery
      .where("order_settlements.ordered_at", ">=", from)
      .where("order_settlements.ordered_at", "<", to);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    { data: rows },
    { data: trendRows },
    { data: payouts },
    { data: rule },
  ] = await Promise.all([
    queryResult(
      settlementsQuery
        .orderBy("order_settlements.ordered_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("order_settlements")
        .select([
          "order_settlements.ordered_at",
          "order_settlements.pool_amount",
          "order_settlements.fee_amount",
          "order_settlements.is_final",
        ])
        .where(
          sql<boolean>`${sql.ref("order_settlements.status")} = any(${[...SALES_ORDER_STATUSES]})`,
        )
        .where("order_settlements.ordered_at", ">=", sixMonthsAgo.toISOString())
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("payout_requests")
        .select([
          "payout_requests.creator_id",
          "payout_requests.amount",
          "payout_requests.status",
        ])
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_pricing_rules")
        .select(["print_pricing_rules.platform_fee_rate"])
        .where("print_pricing_rules.is_active", "=", true)
        .executeTakeFirst(),
    ),
  ]);

  const settlements = (rows ?? []).map(toSettlement);
  const orderIds = settlements.map((s) => s.orderId);
  type SalesItem = Pick<
    Tables<"creator_item_settlements">,
    | "order_id"
    | "creator_id"
    | "goods_amount"
    | "fee_amount"
    | "payout_amount"
    | "creator_name"
  >;
  let items: SalesItem[] = [];
  if (orderIds.length) {
    const { data, error } = await queryResult(
      db
        .selectFrom("creator_item_settlements")
        .select([
          "creator_item_settlements.order_id",
          "creator_item_settlements.creator_id",
          "creator_item_settlements.goods_amount",
          "creator_item_settlements.fee_amount",
          "creator_item_settlements.payout_amount",
          "creator_item_settlements.creator_name",
        ])
        .where(
          sql<boolean>`${sql.ref("creator_item_settlements.order_id")} = any(${orderIds})`,
        )
        .execute(),
    );
    if (error) throw new Error("クリエイター別の精算を取得できませんでした");
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

  // 按分済みの同じDBビューを運営・クリエイター・受取残高で共用する。
  const byCreator = new Map<
    string,
    {
      creatorId: string;
      name: string;
      orders: Set<string>;
      goods: number;
      fee: number;
      payout: number;
    }
  >();
  for (const item of items) {
    if (!item.creator_id || !item.order_id)
      throw new Error("精算の明細が不正です");
    const row = byCreator.get(item.creator_id) ?? {
      creatorId: item.creator_id,
      name: item.creator_name ?? "—",
      orders: new Set<string>(),
      goods: 0,
      fee: 0,
      payout: 0,
    };
    row.orders.add(item.order_id);
    row.goods += item.goods_amount ?? 0;
    row.fee += item.fee_amount ?? 0;
    row.payout += item.payout_amount ?? 0;
    byCreator.set(item.creator_id, row);
  }
  const paidOut = new Map<string, number>();
  const requested = new Map<string, number>();
  for (const p of payouts ?? []) {
    if (p.status === "paid")
      paidOut.set(p.creator_id, (paidOut.get(p.creator_id) ?? 0) + p.amount);
    if (p.status === "requested" || p.status === "processing") {
      requested.set(
        p.creator_id,
        (requested.get(p.creator_id) ?? 0) + p.amount,
      );
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
  const trend = new Map<
    string,
    { pool: number; fee: number; count: number; finalCount: number }
  >();
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

// =============================================================================
// 払込管理
// =============================================================================

/** 振込申請の一覧（口座つき）と、クリエイターごとの残高。 */
export async function listPayoutRequests() {
  const { db } = await requireAdmin();
  const [{ data: requests }, { data: accounts }, { data: balances }] =
    await Promise.all([
      queryResult(
        db
          .selectFrom("payout_requests")
          .select((eb) => [
            "payout_requests.id",
            "payout_requests.creator_id",
            "payout_requests.amount",
            "payout_requests.status",
            "payout_requests.requested_at",
            "payout_requests.processed_at",
            jsonObjectFrom(
              eb
                .selectFrom("profiles as r28")
                .select(["r28.display_name"])
                .whereRef("r28.id", "=", "payout_requests.creator_id"),
            ).as("profiles"),
          ])
          .orderBy("payout_requests.requested_at", "desc")
          .execute(),
      ),
      queryResult(
        db
          .selectFrom("payout_accounts")
          .select([
            "payout_accounts.creator_id",
            "payout_accounts.bank_name",
            "payout_accounts.branch_name",
            "payout_accounts.account_type",
            "payout_accounts.account_number",
            "payout_accounts.account_holder_name",
          ])
          .execute(),
      ),
      queryResult(
        db
          .selectFrom("creator_payout_balances")
          .select([
            "creator_payout_balances.creator_id",
            "creator_payout_balances.available_amount",
          ])
          .execute(),
      ),
    ]);
  const accountById = new Map((accounts ?? []).map((a) => [a.creator_id, a]));
  return {
    requests: (requests ?? []).map((r) => ({
      ...r,
      account: accountById.get(r.creator_id) ?? null,
    })),
    balances: balances ?? [],
  };
}

// =============================================================================
// 運営メンバー
// =============================================================================

/** 運営メンバーの一覧。メールは app_users 側なので管理者用DB関数経由で引く。 */
export async function listAdminMembers() {
  const { db } = await requireAdmin();
  const { data } = await call(db, "list_admin_members", {});
  return data ?? [];
}

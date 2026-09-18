import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult, readPage } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import { printFilesFromSnapshot } from "./print-files";
import { QUEUE_STATUS_FILTERS } from "@/lib/ops/labels";
import type { FilamentMaterial, PrintJobStatus } from "@/types/db";

export type QueueSearchParams = {
  page?: string;
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

  return readPage(
    query
      .orderBy("print_queue.due_at", (order) => order.asc().nullsLast())
      .orderBy("print_queue.job_no", "asc")
      .orderBy("print_queue.id", "asc"),
    params.page,
    50,
  );
}

export type QueueRow = Awaited<
  ReturnType<typeof listPrintQueue>
>["items"][number];

/** Aggregate the job table without loading the joined queue or its images. */
export async function getQueueSummary() {
  const { db } = await requireAdmin();
  return db
    .selectFrom("print_jobs")
    .select([
      sql<number>`count(*) filter (where status = 'queued')::integer`.as(
        "queued",
      ),
      sql<number>`count(*) filter (where status = 'queued' and due_at < now() + interval '24 hours')::integer`.as(
        "queuedDueSoon",
      ),
      sql<number>`count(*) filter (where status in ('printing','reprinting'))::integer`.as(
        "printing",
      ),
      sql<number>`coalesce(sum(est_print_hours) filter (where status in ('printing','reprinting')), 0)::float8`.as(
        "printingHours",
      ),
      sql<number>`count(*) filter (where status = 'printed')::integer`.as(
        "waitingQc",
      ),
      sql<number>`count(*) filter (where status = 'printed' and due_at < now() + interval '24 hours')::integer`.as(
        "waitingQcDueSoon",
      ),
      sql<number>`count(*) filter (where status in ('queued','printing','reprinting') and due_at < now())::integer`.as(
        "overdue",
      ),
    ])
    .executeTakeFirstOrThrow();
}

/** Only distinct materials cross the DB boundary, not every job's material. */
export async function getQueueFilterOptions() {
  const { db } = await requireAdmin();
  const [materials, printers] = await Promise.all([
    db
      .selectFrom("print_queue")
      .select("material")
      .where("material", "is not", null)
      .distinct()
      .execute(),
    db
      .selectFrom("printers")
      .select(["code", "model_name", "is_active"])
      .orderBy("code", "asc")
      .execute(),
  ]);
  return { materials: materials.map((m) => m.material!), printers };
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
        .innerJoin("order_items", "order_items.id", "print_jobs.order_item_id")
        .select([
          "order_items.print_assets_snapshot",
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
              "work_part_instructions.object_id",
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
      .map((p) => p.object_id),
  );

  return {
    job,
    detail,
    printFiles: printFilesFromSnapshot(detail?.print_assets_snapshot),
    events: events ?? [],
    printers: printers ?? [],
    filaments: filaments ?? [],
    work,
    variant,
    slots: slots ?? [],
    parts: parts.filter(
      (p) =>
        p.variant_id !== null || !overridden.has(p.object_id),
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

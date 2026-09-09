import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import { ORDER_STATUS_FILTERS } from "@/lib/ops/labels";
import type { OrderStatus } from "@/types/db";

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

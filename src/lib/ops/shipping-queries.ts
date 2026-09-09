import { sql } from "kysely";
import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { readPage } from "@/lib/db/result";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import type { ShippingCarrier } from "@/types/db";

// =============================================================================
// 出荷済み
// =============================================================================

export type ShipmentSearchParams = {
  carrier?: string;
  q?: string;
  page?: string;
};

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

  if (params.q?.trim()) {
    const like = `%${params.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    query = query.where((eb) =>
      eb.or([
        eb("shipments.tracking_number", "ilike", like),
        eb.exists(
          eb
            .selectFrom("orders")
            .innerJoin("profiles", "profiles.id", "orders.buyer_id")
            .select("orders.id")
            .whereRef("orders.id", "=", "shipments.order_id")
            .where("profiles.display_name", "ilike", like),
        ),
        eb.exists(
          eb
            .selectFrom("order_items")
            .innerJoin("works", "works.id", "order_items.work_id")
            .select("order_items.id")
            .whereRef("order_items.order_id", "=", "shipments.order_id")
            .where("works.title", "ilike", like),
        ),
      ]),
    );
  }
  return readPage(
    query
      .orderBy("shipments.shipped_at", "desc")
      .orderBy("shipments.id", "desc"),
    params.page,
    50,
  );
}

export type ShipmentRow = Awaited<
  ReturnType<typeof listShipments>
>["items"][number];

/** 出荷済みの上の4枚。リードタイムは受注から発送までの日数。 */
export async function getShipmentSummary() {
  const { db } = await requireAdmin();
  const dayStart = sql`(date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')`;
  return db
    .selectFrom("shipments")
    .innerJoin("orders", "orders.id", "shipments.order_id")
    .select([
      sql<number>`count(*) filter (where shipments.shipped_at >= ${dayStart})::integer`.as(
        "today",
      ),
      sql<number>`count(*) filter (where shipments.shipped_at >= ${dayStart} - interval '6 days')::integer`.as(
        "week",
      ),
      sql<number>`count(*)::integer`.as("total"),
      sql<
        number | null
      >`avg(extract(epoch from shipments.shipped_at - orders.created_at) / 86400)::float8`.as(
        "avgLeadDays",
      ),
      sql<number>`coalesce(sum(orders.shipping_fee_amount - coalesce(shipments.shipping_fee_jpy, 0)), 0)::float8`.as(
        "shippingBalance",
      ),
    ])
    .executeTakeFirstOrThrow();
}

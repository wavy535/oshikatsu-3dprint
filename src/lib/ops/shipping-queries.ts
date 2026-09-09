import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import type { ShippingCarrier } from "@/types/db";

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

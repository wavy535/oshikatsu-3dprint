import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import { readPage, queryResult } from "@/lib/db/result";
import "server-only";
import { requireUser } from "@/lib/auth/guards";
import type { OrderStatus } from "@/types/db";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  payment_pending: "支払い待ち",
  paid: "決済完了",
  printing_queued: "印刷待ち",
  printing: "印刷中",
  packaging: "梱包中",
  shipped: "発送済み",
  completed: "取引完了",
  cancelled: "キャンセル",
  refunded: "返金済み",
};

export async function listMyOrders(requestedPage?: unknown) {
  const { db, user } = await requireUser("/mypage/orders");
  return readPage(
    db
      .selectFrom("orders")
      .select((eb) => [
        "orders.id",
        "orders.status",
        "orders.total_amount",
        "orders.created_at",
        "orders.shipped_at",
        "orders.tracking_number",
        jsonArrayFrom(
          eb
            .selectFrom("order_items as r0")
            .select((eb) => [
              "r0.id",
              "r0.quantity",
              "r0.unit_price",
              "r0.size_label_snapshot",
              "r0.work_id",
              "r0.creator_id",
              jsonObjectFrom(
                eb
                  .selectFrom("works as r1")
                  .select((eb) => [
                    "r1.title",
                    jsonArrayFrom(
                      eb
                        .selectFrom("work_images as r2")
                        .select(["r2.storage_path", "r2.sort_order"])
                        .whereRef("r2.work_id", "=", "r1.id")
                        .orderBy("r2.sort_order", "asc")
                        .orderBy("r2.id", "asc")
                        .limit(1),
                    ).as("work_images"),
                  ])
                  .whereRef("r1.id", "=", "r0.work_id"),
              ).as("works"),
              jsonObjectFrom(
                eb
                  .selectFrom("profiles as r3")
                  .select(["r3.display_name"])
                  .whereRef("r3.id", "=", "r0.creator_id"),
              ).as("profiles"),
              jsonObjectFrom(
                eb
                  .selectFrom("reviews as r4")
                  .select(["r4.id", "r4.rating"])
                  .whereRef("r4.order_item_id", "=", "r0.id"),
              ).as("reviews"),
            ])
            .whereRef("r0.order_id", "=", "orders.id"),
        ).as("order_items"),
      ])
      .where("orders.buyer_id", "=", user.id)
      .orderBy("orders.created_at", "desc")
      .orderBy("orders.id", "desc"),
    requestedPage,
  );
}

export async function getMyOrder(id: string) {
  const { db, user } = await requireUser(`/mypage/orders/${id}`);
  const { data } = await queryResult(
    db
      .selectFrom("orders")
      .select((eb) => [
        "orders.id",
        "orders.status",
        "orders.is_demo",
        "orders.subtotal_amount",
        "orders.platform_fee_amount",
        "orders.print_cost_amount",
        "orders.shipping_fee_amount",
        "orders.total_amount",
        "orders.created_at",
        "orders.shipped_at",
        "orders.tracking_number",
        "orders.ship_due_at",
        jsonObjectFrom(
          eb
            .selectFrom("addresses as r5")
            .select([
              "r5.recipient_name",
              "r5.postal_code",
              "r5.prefecture",
              "r5.city",
              "r5.address_line",
              "r5.phone",
            ])
            .whereRef("r5.id", "=", "orders.shipping_address_id"),
        ).as("addresses"),
        jsonArrayFrom(
          eb
            .selectFrom("order_items as r6")
            .select((eb) => [
              "r6.id",
              "r6.quantity",
              "r6.unit_price",
              "r6.size_label_snapshot",
              "r6.work_id",
              "r6.creator_id",
              jsonObjectFrom(
                eb
                  .selectFrom("works as r7")
                  .select((eb) => [
                    "r7.title",
                    jsonArrayFrom(
                      eb
                        .selectFrom("work_images as r8")
                        .select(["r8.storage_path", "r8.sort_order"])
                        .whereRef("r8.work_id", "=", "r7.id"),
                    ).as("work_images"),
                  ])
                  .whereRef("r7.id", "=", "r6.work_id"),
              ).as("works"),
              jsonObjectFrom(
                eb
                  .selectFrom("profiles as r9")
                  .select(["r9.display_name"])
                  .whereRef("r9.id", "=", "r6.creator_id"),
              ).as("profiles"),
              jsonObjectFrom(
                eb
                  .selectFrom("reviews as r10")
                  .select(["r10.id", "r10.rating"])
                  .whereRef("r10.order_item_id", "=", "r6.id"),
              ).as("reviews"),
            ])
            .whereRef("r6.order_id", "=", "orders.id"),
        ).as("order_items"),
      ])
      .where("orders.id", "=", id)
      .where("orders.buyer_id", "=", user.id)
      .executeTakeFirst(),
  );
  return data;
}

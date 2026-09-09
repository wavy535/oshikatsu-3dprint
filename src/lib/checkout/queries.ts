import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import "server-only";

import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/lib/cart/queries";

/**
 * 決済画面が読むもの。金額はカート（work_variant_pricing）と料金表から出すが、
 * 確定値は place_order() が DB 側で写す（ここは見せるための計算）。
 */
export async function getCheckoutContext() {
  const { db, user } = await requireUser("/checkout");

  const [{ lines }, addressResult, ruleResult] = await Promise.all([
    getCart(),
    queryResult(
      db
        .selectFrom("addresses")
        .select([
          "addresses.id",
          "addresses.recipient_name",
          "addresses.postal_code",
          "addresses.prefecture",
          "addresses.city",
          "addresses.address_line",
          "addresses.phone",
          "addresses.is_default",
        ])
        .where("addresses.user_id", "=", user.id)
        .orderBy("addresses.is_default", "desc")
        .orderBy("addresses.created_at", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_pricing_rules")
        .select(["print_pricing_rules.shipping_fee_jpy"])
        .where("print_pricing_rules.is_active", "=", true)
        .executeTakeFirst(),
    ),
  ]);

  if (addressResult.error) throw new Error("お届け先を取得できませんでした");
  if (ruleResult.error || !ruleResult.data)
    throw new Error("送料を取得できませんでした");
  if (
    lines.some((line) => line.goodsPrice === null || line.printFee === null)
  ) {
    throw new Error(
      "価格を確認できない作品があります。カートを確認してください",
    );
  }
  const goods = lines.reduce((n, l) => n + l.goodsPrice! * l.quantity, 0);
  const printFee = lines.reduce((n, l) => n + l.printFee! * l.quantity, 0);
  const shipping = ruleResult.data.shipping_fee_jpy;

  return {
    lines,
    addresses: addressResult.data ?? [],
    totals: { goods, printFee, shipping, total: goods + printFee + shipping },
  };
}

/** 注文完了画面。自分の注文だけ読める（RLS）。 */
export async function getCompletedOrder(orderId: string) {
  const { db, user } = await requireUser("/mypage/orders");
  const { data } = await queryResult(
    db
      .selectFrom("orders")
      .select((eb) => [
        "orders.id",
        "orders.status",
        "orders.is_demo",
        "orders.total_amount",
        "orders.subtotal_amount",
        "orders.print_cost_amount",
        "orders.shipping_fee_amount",
        "orders.ship_due_at",
        "orders.created_at",
        jsonArrayFrom(
          eb
            .selectFrom("order_items as r0")
            .select((eb) => [
              "r0.id",
              "r0.quantity",
              "r0.size_label_snapshot",
              "r0.unit_price",
              jsonObjectFrom(
                eb
                  .selectFrom("works as r1")
                  .select(["r1.title"])
                  .whereRef("r1.id", "=", "r0.work_id"),
              ).as("works"),
            ])
            .whereRef("r0.order_id", "=", "orders.id"),
        ).as("order_items"),
      ])
      .where("orders.id", "=", orderId)
      .where("orders.buyer_id", "=", user.id)
      .executeTakeFirst(),
  );
  return data;
}

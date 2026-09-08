import "server-only";

import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/lib/cart/queries";

/**
 * 決済画面が読むもの。金額はカート（work_variant_pricing）と料金表から出すが、
 * 確定値は place_order() が DB 側で写す（ここは見せるための計算）。
 */
export async function getCheckoutContext() {
  const { supabase, user } = await requireUser("/checkout");

  const [{ lines }, addressResult, ruleResult] = await Promise.all([
    getCart(),
    supabase
      .from("addresses")
      .select("id, recipient_name, postal_code, prefecture, city, address_line, phone, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("print_pricing_rules")
      .select("shipping_fee_jpy")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (addressResult.error) throw new Error("お届け先を取得できませんでした");
  if (ruleResult.error || !ruleResult.data) throw new Error("送料を取得できませんでした");
  if (lines.some((line) => line.goodsPrice === null || line.printFee === null)) {
    throw new Error("価格を確認できない作品があります。カートを確認してください");
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
  const { supabase, user } = await requireUser("/mypage/orders");
  const { data } = await supabase
    .from("orders")
    .select(
      `id, status, is_demo, total_amount, subtotal_amount, print_cost_amount, shipping_fee_amount, ship_due_at, created_at,
       order_items(id, quantity, size_label_snapshot, unit_price, works(title))`
    )
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  return data;
}

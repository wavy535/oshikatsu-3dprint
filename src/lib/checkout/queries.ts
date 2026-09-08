import "server-only";

import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/lib/cart/queries";
import { paymentMode } from "@/lib/payments/stripe";

/**
 * 決済画面が読むもの。金額はカート（work_variant_pricing）と料金表から出すが、
 * 確定値は place_order() が DB 側で写す（ここは見せるための計算）。
 */
export async function getCheckoutContext() {
  const { supabase, user } = await requireUser("/checkout");

  const [{ lines }, { data: addresses }, { data: rule }] = await Promise.all([
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

  // 作品代金と印刷代行費を分けて見せる（カートの price は buyer_total = 作品代金 + 代行費）
  const variantIds = lines.map((l) => l.variantId);
  const { data: pricing } = variantIds.length
    ? await supabase
        .from("work_variant_pricing")
        .select("id, price_jpy, print_fee_jpy")
        .in("id", variantIds)
    : { data: [] };
  const byId = new Map((pricing ?? []).map((p) => [p.id, p]));

  const goods = lines.reduce((n, l) => n + (byId.get(l.variantId)?.price_jpy ?? 0) * l.quantity, 0);
  const printFee = lines.reduce((n, l) => n + (byId.get(l.variantId)?.print_fee_jpy ?? 0) * l.quantity, 0);
  const shipping = rule?.shipping_fee_jpy ?? 0;

  return {
    lines,
    addresses: addresses ?? [],
    totals: { goods, printFee, shipping, total: goods + printFee + shipping },
    paymentMode: paymentMode(),
  };
}

/** 注文完了画面。自分の注文だけ読める（RLS）。 */
export async function getCompletedOrder(orderId: string) {
  const { supabase, user } = await requireUser("/mypage/orders");
  const { data } = await supabase
    .from("orders")
    .select(
      `id, status, total_amount, subtotal_amount, print_cost_amount, shipping_fee_amount, ship_due_at, created_at,
       order_items(id, quantity, size_label_snapshot, unit_price, works(title))`
    )
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  return data;
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe, siteUrl } from "@/lib/payments/stripe";

export type CheckoutActionState = { error: string | null };

const schema = z.object({
  addressId: z.string().uuid("お届け先を選んでください"),
  note: z.string().max(500).optional(),
});

/**
 * 注文を確定する。
 *
 * 1. place_order() でカートから支払い前の注文を作る（検査と金額は DB 側）
 * 2. Stripe のキーがあれば Checkout Session を作ってそこへ送る。
 *    支払いの反映は webhook（/api/stripe/webhook）と完了画面の二重で受ける
 * 3. キーが無ければ開発用に即時確定する（confirm_order_payment）
 */
export async function placeOrderAction(
  _prev: CheckoutActionState,
  formData: FormData
): Promise<CheckoutActionState> {
  const parsed = schema.safeParse({
    addressId: formData.get("addressId"),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const { supabase, user } = await requireUser("/checkout");

  const { data: orderId, error } = await supabase.rpc("place_order", {
    p_address_id: parsed.data.addressId,
    p_note: parsed.data.note ?? undefined,
  });
  if (error || !orderId) {
    // DB 側の raise exception の文言（「在庫が足りません」など）をそのまま見せる
    return { error: error?.message ?? "注文を作成できませんでした" };
  }

  const stripe = getStripe();
  if (!stripe) {
    // 開発用：決済を挟まずに支払い済みにする。本番ではキーが入っているのでここには来ない
    const service = createServiceRoleClient();
    const { error: confirmError } = await service.rpc("confirm_order_payment", {
      p_order_id: orderId,
      p_payment_ref: `dev-${Date.now()}`,
    });
    if (confirmError) return { error: `支払いの確定に失敗しました（${confirmError.message}）` };
    revalidatePath("/cart");
    redirect(`/checkout/complete?order=${orderId}`);
  }

  const { data: order } = await supabase
    .from("orders")
    .select("subtotal_amount, print_cost_amount, shipping_fee_amount, total_amount")
    .eq("id", orderId)
    .single();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    customer_email: user.email ?? undefined,
    metadata: { order_id: orderId },
    line_items: [
      { quantity: 1, price_data: { currency: "jpy", unit_amount: order?.subtotal_amount ?? 0, product_data: { name: "作品代金" } } },
      { quantity: 1, price_data: { currency: "jpy", unit_amount: order?.print_cost_amount ?? 0, product_data: { name: "印刷代行費" } } },
      { quantity: 1, price_data: { currency: "jpy", unit_amount: order?.shipping_fee_amount ?? 0, product_data: { name: "送料" } } },
    ].filter((li) => li.price_data.unit_amount > 0),
    success_url: `${siteUrl()}/checkout/complete?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/checkout?cancelled=${orderId}`,
  });

  if (!session.url) return { error: "決済ページを開けませんでした" };
  redirect(session.url);
}

/** Stripe から戻ってこなかった注文を、買う人が自分で取り消す。 */
export async function cancelUnpaidOrderAction(orderId: string) {
  const { supabase } = await requireUser("/checkout");
  await supabase.rpc("cancel_unpaid_order", { p_order_id: orderId });
  revalidatePath("/mypage/orders");
}

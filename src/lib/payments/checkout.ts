import "server-only";
import type Stripe from "stripe";

import { requireUser } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe, paymentMode } from "@/lib/payments/stripe";
import { siteUrl } from "@/lib/site";
import { idSchema } from "@/lib/validation";
import type { Tables } from "@/types/db";

export class PaymentError extends Error {}

async function ownOrder(orderId: string) {
  const { supabase, user } = await requireUser("/mypage/orders");
  const { data: order, error } = await supabase.from("orders").select("*")
    .eq("id", orderId).eq("buyer_id", user.id).maybeSingle();
  if (error || !order) throw new PaymentError("注文を確認できませんでした");
  return { order, supabase };
}

function stripeClient() {
  const stripe = getStripe();
  if (!stripe) throw new PaymentError("お支払いを一時的に利用できません");
  return stripe;
}

/** 呼び出し元は署名検証済みイベント、またはStripe APIから取得したSessionに限定。 */
export async function applyCheckoutSession(session: Stripe.Checkout.Session, paid: boolean) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return; // 別用途のCheckoutイベント
  if (!idSchema.safeParse(orderId).success || session.mode !== "payment"
    || (session.client_reference_id && session.client_reference_id !== orderId)
    || (paid && session.payment_status !== "paid")) {
    throw new PaymentError("注文に対応する決済を確認できませんでした");
  }
  const service = createServiceRoleClient();
  const { error } = await service.rpc("apply_stripe_checkout", {
    p_order_id: orderId,
    p_session_id: session.id,
    p_amount_total: session.amount_total ?? -1,
    p_currency: session.currency ?? "",
    p_paid: paid,
    p_payment_ref: paid
      ? typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id
      : undefined,
  });
  if (error) throw new PaymentError("決済結果を注文に反映できませんでした");
}

async function checkoutSession(order: Tables<"orders">) {
  const stripe = stripeClient();
  if (order.stripe_checkout_session_id) return stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
  // Stripeの冪等キーは24時間以降に失効し得る。結果不明の古い要求を新規決済として再送しない。
  if (!order.checkout_started_at || Date.now() - new Date(order.checkout_started_at).getTime() >= 23 * 60 * 60 * 1000) {
    throw new PaymentError("決済の確認に時間がかかっています。運営へお問い合わせください");
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    line_items: [
      ["作品代金", order.subtotal_amount],
      ["印刷代行費", order.print_cost_amount],
      ["送料", order.shipping_fee_amount],
    ].filter(([, amount]) => Number(amount) > 0).map(([name, amount]) => ({
      quantity: 1,
      price_data: { currency: "jpy", unit_amount: Number(amount), product_data: { name: String(name) } },
    })),
    success_url: `${siteUrl()}/checkout/complete?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/mypage/orders/${order.id}`,
  }, { idempotencyKey: `checkout:${order.id}` });

  const service = createServiceRoleClient();
  const { data, error } = await service.from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id).is("stripe_checkout_session_id", null).select("id");
  if (error) throw new PaymentError("決済情報を保存できませんでした。もう一度お試しください");
  if (!data?.length) {
    const { data: saved, error: readError } = await service.from("orders")
      .select("stripe_checkout_session_id").eq("id", order.id).single();
    if (readError || saved?.stripe_checkout_session_id !== session.id) throw new PaymentError("決済情報が一致しません");
  }
  return session;
}

/** 戻り値のURLへリダイレクトするのはActionの役割。再開時も本人・状態を確認する。 */
export async function startOrderPayment(orderId: string) {
  const mode = paymentMode();
  if (mode === "unavailable") throw new PaymentError("お支払いを一時的に利用できません");
  const { order, supabase } = await ownOrder(orderId);
  if (order.status !== "payment_pending") return `/mypage/orders/${order.id}`;
  if (mode === "development") {
    if (order.checkout_started_at) throw new PaymentError("この決済を確認できません。運営へお問い合わせください");
    const { error } = await createServiceRoleClient().rpc("confirm_order_payment", {
      p_order_id: order.id, p_payment_ref: `dev-${order.id}`,
    });
    if (error) throw new PaymentError("支払いを確定できませんでした");
    return `/checkout/complete?order=${order.id}`;
  }
  const { data: started, error } = await supabase.rpc("begin_order_checkout", { p_order_id: order.id });
  if (error || !started) throw new PaymentError("決済を開始できませんでした");
  const session = await checkoutSession(started);
  if (session.payment_status === "paid") {
    await applyCheckoutSession(session, true);
    return `/checkout/complete?order=${order.id}`;
  }
  if (session.status === "expired") {
    await applyCheckoutSession(session, false);
    throw new PaymentError("お支払い期限が切れました。カートから注文し直してください");
  }
  if (session.status === "complete") return `/checkout/complete?order=${order.id}`;
  const current = await ownOrder(order.id);
  if (current.order.status !== "payment_pending") return `/mypage/orders/${order.id}`;
  if (!session.url) throw new PaymentError("決済ページを開けませんでした");
  return session.url;
}

export async function syncOrderPayment(orderId: string, sessionId: string) {
  const { order } = await ownOrder(orderId);
  if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== sessionId) {
    throw new PaymentError("この注文の決済ではありません");
  }
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  if ((session.metadata?.order_id ?? session.client_reference_id) !== order.id) {
    throw new PaymentError("この注文の決済ではありません");
  }
  if (session.payment_status !== "paid") return false;
  await applyCheckoutSession(session, true);
  return true;
}

export async function cancelOrderPayment(orderId: string) {
  const { order, supabase } = await ownOrder(orderId);
  if (order.status !== "payment_pending") throw new PaymentError("支払い待ちの注文だけ取り消せます");
  if (!order.checkout_started_at) {
    const { error } = await supabase.rpc("cancel_unpaid_order", { p_order_id: order.id });
    if (error) throw new PaymentError("注文を取り消せませんでした。決済状況を確認してください");
    return;
  }
  let session = await checkoutSession(order);
  if (session.payment_status === "paid") {
    await applyCheckoutSession(session, true);
    throw new PaymentError("お支払い済みの注文は取り消せません");
  }
  if (session.status === "open") session = await stripeClient().checkout.sessions.expire(session.id);
  if (session.status !== "expired") throw new PaymentError("決済処理中のため、まだ取り消せません");
  await applyCheckoutSession(session, false);
}

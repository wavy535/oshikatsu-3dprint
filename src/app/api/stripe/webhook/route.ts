import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/payments/stripe";
import { applyCheckoutSession } from "@/lib/payments/checkout";

/**
 * Stripe の webhook。支払い完了を confirm_order_payment() に渡す。
 *
 * Stripe ダッシュボードでこの URL（`${SITE_URL}/api/stripe/webhook`）を登録し、
 * 署名シークレットを STRIPE_WEBHOOK_SECRET に入れる。
 * ローカルでは `stripe listen --forward-to localhost:3000/api/stripe/webhook`。
 *
 * DB反映の失敗は非2xxを返し、Stripeからの再送で回復する。
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "stripe is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (e) {
    return NextResponse.json({ error: `invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status === "paid") await applyCheckoutSession(session, true);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        await applyCheckoutSession(session, false);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe event failed:", event.id, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "payment update failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

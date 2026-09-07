import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/payments/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Stripe の webhook。支払い完了を confirm_order_payment() に渡す。
 *
 * Stripe ダッシュボードでこの URL（`${SITE_URL}/api/stripe/webhook`）を登録し、
 * 署名シークレットを STRIPE_WEBHOOK_SECRET に入れる。
 * ローカルでは `stripe listen --forward-to localhost:3000/api/stripe/webhook`。
 *
 * confirm_order_payment は冪等なので、完了画面側からも呼んで良い（二重に来ても増えない）。
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

  const service = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (orderId && session.payment_status === "paid") {
        const paymentRef =
          typeof session.payment_intent === "string" ? session.payment_intent : session.id;
        await service.rpc("confirm_order_payment", { p_order_id: orderId, p_payment_ref: paymentRef });
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (orderId) await service.rpc("cancel_unpaid_order", { p_order_id: orderId });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

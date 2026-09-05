import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

// DESIGN.md §7.3: 注文確定は必ず Webhook で行う。event.id を stripe_events に
// 記録して冪等化する。
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new NextResponse("missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  const { error: dupeError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (dupeError) {
    return NextResponse.json({ received: true, duplicated: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.order_id) {
        await admin.rpc("mark_order_paid", {
          p_order_id: s.metadata.order_id,
          p_payment_intent_id: (s.payment_intent as string) ?? null,
        });
      }
      break;
    }
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.order_id) {
        await admin.rpc("cancel_order", {
          p_order_id: s.metadata.order_id,
          p_reason: "checkout_expired",
        });
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (paymentIntentId) {
        const { data: order } = await admin
          .from("orders")
          .select("id, status")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .single();
        if (order) {
          await admin
            .from("orders")
            .update({ status: "refunded", refunded_at: new Date().toISOString() })
            .eq("id", order.id);
          await admin.from("order_events").insert({
            order_id: order.id,
            from_status: order.status,
            to_status: "refunded",
            actor_id: null,
            reason: "stripe_refund",
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

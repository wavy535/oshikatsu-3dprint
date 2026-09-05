"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import type { ActionResult } from "@/lib/action-result";

const SHIPPING_FEE = Number(process.env.DEFAULT_SHIPPING_FEE ?? 800);

export async function startCheckout(addressId: string): Promise<ActionResult<{ url: string }>> {
  const { supabase, user } = await requireUser();

  const { data: rpcResult, error: rpcError } = await supabase.rpc("create_pending_order", {
    p_buyer_id: user.id,
    p_address_id: addressId,
    p_shipping_fee: SHIPPING_FEE,
  });
  if (rpcError || !rpcResult?.[0]) {
    return { ok: false, error: rpcError?.message || "注文の作成に失敗しました" };
  }
  const orderId = rpcResult[0].order_id;

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, order_items(*)")
    .eq("id", orderId)
    .single();
  if (!order || order.order_items.length === 0) {
    return { ok: false, error: "注文の作成に失敗しました" };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: order.order_items.map((item) => ({
      price_data: {
        currency: "jpy",
        unit_amount: item.unit_price,
        product_data: {
          name: `${item.product_title}（${item.filament_name}）`,
          images: item.product_image_url ? [item.product_image_url] : undefined,
        },
      },
      quantity: item.quantity,
    })),
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: SHIPPING_FEE, currency: "jpy" },
          display_name: "全国一律配送（受注生産のため発送まで7〜14日）",
        },
      },
    ],
    metadata: { order_id: order.id, buyer_id: user.id },
    payment_intent_data: { metadata: { order_id: order.id } },
    success_url: `${origin}/checkout/complete?order=${order.id}`,
    cancel_url: `${origin}/cart?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  if (!session.url) {
    return { ok: false, error: "決済セッションの作成に失敗しました" };
  }

  // orders への UPDATE は buyer 向けポリシーが存在しないため admin client を使う
  // （DESIGN.md §8.3 orders コメント準拠）
  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id);

  revalidatePath("/cart");
  return { ok: true, data: { url: session.url } };
}

export async function confirmDelivery(orderId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("buyer_id", user.id)
    .single();
  if (!order) {
    return { ok: false, error: "注文が見つかりません" };
  }
  if (order.status !== "shipped") {
    return { ok: false, error: "発送済みの注文のみ受取確認できます" };
  }

  // buyer には orders の UPDATE ポリシーが無いため admin client 経由で行う
  // （DESIGN.md §8.3 orders コメント: 「Server Action側ではadmin client経由で完了させる」）
  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) return { ok: false, error: "受取確認に失敗しました" };

  await admin.from("order_events").insert({
    order_id: orderId,
    from_status: "shipped",
    to_status: "completed",
    actor_id: user.id,
    reason: "buyer_confirmed",
  });

  revalidatePath(`/mypage/orders/${orderId}`);
  revalidatePath("/mypage/orders");
  return { ok: true, data: undefined };
}

export async function requestCancel(orderId: string, reason: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: "キャンセルに失敗しました" };

  revalidatePath(`/mypage/orders/${orderId}`);
  revalidatePath("/mypage/orders");
  return { ok: true, data: undefined };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCreator, requireUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import type { ActionResult } from "@/lib/action-result";
import {
  createCustomOrderSchema,
  submitQuoteSchema,
  type CreateCustomOrderInput,
  type SubmitQuoteInput,
} from "./schema";

const SHIPPING_FEE = Number(process.env.DEFAULT_SHIPPING_FEE ?? 800);

/**
 * オーダーメイド相談を送る。相談内容はメッセージスレッドにも流し込むので、
 * クリエイターは普段どおりメッセージ画面で気づける（Figma の
 * 「送信するとメッセージとしてクリエイターに届く」）。
 */
export async function createCustomOrder(
  input: CreateCustomOrderInput
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();

  const parsed = createCustomOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: product } = await supabase
    .from("products")
    .select("id, title, creator_id, status")
    .eq("id", v.productId)
    .single();
  if (!product || product.status !== "published") {
    return { ok: false, error: "作品が見つかりません" };
  }
  if (product.creator_id === user.id) {
    return { ok: false, error: "自分の作品には相談できません" };
  }

  // 相談スレッド（作品ごとの pre_purchase）を使い回す
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("kind", "pre_purchase")
    .eq("buyer_id", user.id)
    .eq("creator_id", product.creator_id)
    .eq("product_id", v.productId)
    .maybeSingle();

  let threadId = existing?.id ?? null;
  if (!threadId) {
    const { data: created } = await supabase
      .from("message_threads")
      .insert({
        kind: "pre_purchase",
        buyer_id: user.id,
        creator_id: product.creator_id,
        product_id: v.productId,
        subject: `「${product.title}」オーダーメイド相談`,
      })
      .select("id")
      .single();
    threadId = created?.id ?? null;
  }

  const { data: customOrder, error } = await supabase
    .from("custom_orders")
    .insert({
      buyer_id: user.id,
      creator_id: product.creator_id,
      product_id: v.productId,
      thread_id: threadId,
      nui_size_id: v.nuiSizeId ?? null,
      color_note: v.colorNote || null,
      finish_note: v.finishNote || null,
      request_note: v.requestNote,
      desired_date: v.desiredDate || null,
    })
    .select("id")
    .single();
  if (error || !customOrder) {
    return { ok: false, error: "相談の送信に失敗しました" };
  }

  if (threadId) {
    const lines = [
      `【オーダーメイド相談】${product.title}`,
      v.colorNote ? `カラー希望: ${v.colorNote}` : null,
      v.finishNote ? `加工希望: ${v.finishNote}` : null,
      v.desiredDate ? `希望納期: ${v.desiredDate}` : null,
      "",
      v.requestNote,
    ].filter(Boolean);
    await supabase
      .from("messages")
      .insert({ thread_id: threadId, sender_id: user.id, body: lines.join("\n") });
  }

  revalidatePath("/mypage/custom-orders");
  return { ok: true, data: { id: customOrder.id } };
}

/** クリエイターが見積りを返す */
export async function submitQuote(input: SubmitQuoteInput): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const parsed = submitQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: co } = await supabase
    .from("custom_orders")
    .select("id, status, creator_id, thread_id")
    .eq("id", v.customOrderId)
    .single();
  if (!co || co.creator_id !== user.id) {
    return { ok: false, error: "相談が見つかりません" };
  }
  if (co.status !== "requested" && co.status !== "quoted") {
    return { ok: false, error: "この相談には見積りを出せません" };
  }

  const { error } = await supabase
    .from("custom_orders")
    .update({
      status: "quoted",
      quote_price: v.quotePrice,
      quote_filament_g: v.quoteFilamentG ?? null,
      quote_print_min: v.quotePrintMin ?? null,
      quote_part_count: v.quotePartCount ?? null,
      quote_lead_days: v.quoteLeadDays,
      quote_spec: v.quoteSpec || null,
      quote_note: v.quoteNote || null,
      quoted_at: new Date().toISOString(),
    })
    .eq("id", v.customOrderId);
  if (error) return { ok: false, error: "見積りの送信に失敗しました" };

  if (co.thread_id) {
    await supabase.from("messages").insert({
      thread_id: co.thread_id,
      sender_id: user.id,
      body: `【見積り】¥${v.quotePrice.toLocaleString()}（お届け目安 ${v.quoteLeadDays}日）\n${v.quoteSpec ?? ""}`,
    });
  }

  revalidatePath(`/studio/custom-orders/${v.customOrderId}`);
  revalidatePath("/studio/custom-orders");
  return { ok: true, data: undefined };
}

/** 購入者が見積りを見送る */
export async function rejectQuote(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("custom_orders")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("buyer_id", user.id)
    .in("status", ["requested", "quoted"]);
  if (error) return { ok: false, error: "更新に失敗しました" };

  revalidatePath(`/custom-orders/${id}`);
  return { ok: true, data: undefined };
}

/**
 * 見積りを承認して決済へ進む。
 * 通常のカート決済と同じ orders / order_items に落としてから Stripe に渡すので、
 * 決済確定後は印刷キュー・精算・レビューまで既存の流れに合流する。
 */
export async function approveQuoteAndCheckout(
  customOrderId: string,
  addressId: string
): Promise<ActionResult<{ url: string }>> {
  const { supabase, user } = await requireUser();

  const { data: co } = await supabase
    .from("custom_orders")
    .select("id, status, buyer_id, quote_price, products(title, slug)")
    .eq("id", customOrderId)
    .single();
  if (!co || co.buyer_id !== user.id) {
    return { ok: false, error: "見積りが見つかりません" };
  }
  if (co.status !== "quoted" && co.status !== "approved") {
    return { ok: false, error: "承認できる見積りがありません" };
  }

  if (co.status === "quoted") {
    const { error } = await supabase
      .from("custom_orders")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", customOrderId);
    if (error) return { ok: false, error: "承認に失敗しました" };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "create_order_from_custom_order",
    {
      p_custom_order_id: customOrderId,
      p_address_id: addressId,
      p_shipping_fee: SHIPPING_FEE,
    }
  );
  if (rpcError || !rpcResult?.[0]) {
    return { ok: false, error: rpcError?.message || "注文の作成に失敗しました" };
  }
  const orderId = rpcResult[0].order_id;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: co.quote_price ?? 0,
          product_data: { name: `${co.products?.title}（オーダーメイド）` },
        },
        quantity: 1,
      },
    ],
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: SHIPPING_FEE, currency: "jpy" },
          display_name: "全国一律配送（受注生産のため発送まで7〜14日）",
        },
      },
    ],
    metadata: { order_id: orderId, buyer_id: user.id, custom_order_id: customOrderId },
    payment_intent_data: { metadata: { order_id: orderId } },
    success_url: `${origin}/checkout/complete?order=${orderId}`,
    cancel_url: `${origin}/custom-orders/${customOrderId}?canceled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  if (!session.url) {
    return { ok: false, error: "決済セッションの作成に失敗しました" };
  }

  // orders への UPDATE は buyer 向けポリシーが無いので admin client を使う
  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", orderId);

  revalidatePath(`/custom-orders/${customOrderId}`);
  return { ok: true, data: { url: session.url } };
}

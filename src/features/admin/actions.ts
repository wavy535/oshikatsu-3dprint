"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getStripe } from "@/lib/stripe/server";
import type { ActionResult } from "@/lib/action-result";
import {
  registerShipmentSchema,
  reviewCreatorApplicationSchema,
  reviewProductSchema,
  updateShipmentSchema,
  type RegisterShipmentInput,
  type ReviewCreatorApplicationInput,
  type ReviewProductInput,
  type UpdateShipmentInput,
} from "./schema";

export async function reviewCreatorApplication(
  input: ReviewCreatorApplicationInput
): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const parsed = reviewCreatorApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  if (v.decision === "approve") {
    const { error: cpError } = await supabase
      .from("creator_profiles")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
      .eq("user_id", v.userId);
    if (cpError) return { ok: false, error: "承認に失敗しました" };

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_creator: true })
      .eq("id", v.userId);
    if (profileError) return { ok: false, error: "承認に失敗しました" };
  } else {
    const { error } = await supabase
      .from("creator_profiles")
      .update({ status: "suspended", reject_reason: v.reason ?? null })
      .eq("user_id", v.userId);
    if (error) return { ok: false, error: "却下に失敗しました" };
  }

  revalidatePath("/admin/users");
  return { ok: true, data: undefined };
}

export async function reviewProduct(input: ReviewProductInput): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = reviewProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("products")
    .update(
      v.decision === "approve"
        ? { status: "published", published_at: new Date().toISOString(), rejected_reason: null }
        : { status: "rejected", rejected_reason: v.reason ?? null }
    )
    .eq("id", v.id);
  if (error) return { ok: false, error: "審査処理に失敗しました" };

  revalidatePath("/admin/products");
  return { ok: true, data: undefined };
}

export async function startPrinting(orderId: string): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (!order || order.status !== "paid") {
    return { ok: false, error: "支払い済みの注文のみ印刷開始できます" };
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "printing", printing_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) return { ok: false, error: "印刷開始に失敗しました" };

  await supabase.from("order_events").insert({
    order_id: orderId,
    from_status: "paid",
    to_status: "printing",
    actor_id: user.id,
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, data: undefined };
}

export async function updateItemStatus(
  orderItemId: string,
  status: "pending" | "printing" | "printed" | "shipped" | "cancelled"
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { data: item, error } = await supabase
    .from("order_items")
    .update({ item_status: status, printed_at: status === "printed" ? new Date().toISOString() : undefined })
    .eq("id", orderItemId)
    .select("order_id")
    .single();
  if (error || !item) return { ok: false, error: "ステータス更新に失敗しました" };

  revalidatePath(`/admin/orders/${item.order_id}`);
  return { ok: true, data: undefined };
}

export async function registerShipment(input: RegisterShipmentInput): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const parsed = registerShipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", v.orderId)
    .single();
  if (!order || order.status !== "printing") {
    return { ok: false, error: "印刷中の注文のみ発送登録できます" };
  }

  const { error: shipError } = await supabase.from("shipments").insert({
    order_id: v.orderId,
    carrier: v.carrier,
    tracking_number: v.trackingNumber,
    created_by: user.id,
  });
  if (shipError) return { ok: false, error: "発送登録に失敗しました（追跡番号が重複していないか確認してください）" };

  const { error: orderError } = await supabase
    .from("orders")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("id", v.orderId);
  if (orderError) return { ok: false, error: "発送登録に失敗しました" };

  await supabase.from("order_events").insert({
    order_id: v.orderId,
    from_status: "printing",
    to_status: "shipped",
    actor_id: user.id,
  });

  revalidatePath(`/admin/orders/${v.orderId}`);
  return { ok: true, data: undefined };
}

export async function updateShipment(input: UpdateShipmentInput): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = updateShipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data, error } = await supabase
    .from("shipments")
    .update({ carrier: v.carrier, tracking_number: v.trackingNumber })
    .eq("id", v.shipmentId)
    .select("order_id")
    .single();
  if (error || !data) return { ok: false, error: "追跡番号の修正に失敗しました" };

  revalidatePath(`/admin/orders/${data.order_id}`);
  return { ok: true, data: undefined };
}

export async function updateAdminNote(orderId: string, note: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.from("orders").update({ admin_note: note }).eq("id", orderId);
  if (error) return { ok: false, error: "メモの保存に失敗しました" };

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, data: undefined };
}

export async function adminCancelOrder(orderId: string, reason: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason });
  if (error) return { ok: false, error: "キャンセルに失敗しました" };

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, data: undefined };
}

export async function refundOrder(orderId: string, amount?: number): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select("status, stripe_payment_intent_id")
    .eq("id", orderId)
    .single();
  if (!order?.stripe_payment_intent_id) {
    return { ok: false, error: "決済情報が見つかりません" };
  }
  if (!["paid", "printing", "shipped"].includes(order.status)) {
    return { ok: false, error: "この注文は返金できません" };
  }

  try {
    await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount,
    });
  } catch {
    return { ok: false, error: "Stripeでの返金処理に失敗しました" };
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) return { ok: false, error: "返金は完了しましたが注文更新に失敗しました" };

  await supabase.from("order_events").insert({
    order_id: orderId,
    from_status: order.status,
    to_status: "refunded",
    actor_id: user.id,
    reason: "admin_refund",
  });

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, data: undefined };
}

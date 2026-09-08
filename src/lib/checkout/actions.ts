"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";
import { requireUser } from "@/lib/auth/guards";
import { paymentMode } from "@/lib/payments/stripe";
import { PaymentError, startOrderPayment, syncOrderPayment, cancelOrderPayment } from "@/lib/payments/checkout";

export type CheckoutActionState = { error: string | null; orderId?: string; ok?: boolean };
const schema = z.object({ addressId: idSchema, note: z.string().max(500).optional() });

function paymentFailure(error: unknown, orderId?: string): CheckoutActionState {
  console.error("Checkout failed:", error instanceof Error ? error.message : "unknown error");
  return {
    error: error instanceof PaymentError ? error.message : "処理できませんでした。注文の状態を確認し、もう一度お試しください。",
    orderId,
  };
}

export async function placeOrderAction(
  _prev: CheckoutActionState, formData: FormData
): Promise<CheckoutActionState> {
  // 設定不備では注文を作成しない。再開時にも同じ条件を適用する。
  if (paymentMode() === "unavailable") return { error: "現在お支払いを利用できません。しばらくしてからお試しください。" };
  if (formData.get("orderId")) return resumeOrderPaymentAction(_prev, formData);
  const parsed = schema.safeParse({
    addressId: formData.get("addressId"),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const { supabase } = await requireUser("/checkout");
  const { data: orderId, error } = await supabase.rpc("place_order", {
    p_address_id: parsed.data.addressId, p_note: parsed.data.note,
  });
  if (error || !orderId) return { error: error?.message ?? "注文を作成できませんでした" };
  let url: string;
  try {
    url = await startOrderPayment(orderId);
  } catch (error) {
    return paymentFailure(error, orderId);
  }
  revalidatePath("/cart");
  redirect(url);
}

export async function resumeOrderPaymentAction(
  _prev: CheckoutActionState, formData: FormData
): Promise<CheckoutActionState> {
  const parsed = idSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "注文の指定が不正です" };
  // 認証のredirectを決済エラーとして握りつぶさない。
  await requireUser("/mypage/orders");
  let url: string;
  try {
    url = await startOrderPayment(parsed.data);
  } catch (error) {
    return paymentFailure(error, parsed.data);
  }
  revalidatePath("/cart");
  revalidatePath(`/mypage/orders/${parsed.data}`);
  redirect(url);
}

export async function checkOrderPaymentAction(
  _prev: CheckoutActionState, formData: FormData
): Promise<CheckoutActionState> {
  const parsed = z.object({ orderId: idSchema, sessionId: z.string().startsWith("cs_").max(255) }).safeParse({
    orderId: formData.get("orderId"), sessionId: formData.get("sessionId"),
  });
  if (!parsed.success) return { error: "決済の指定が不正です" };
  await requireUser("/mypage/orders");
  try {
    const ok = await syncOrderPayment(parsed.data.orderId, parsed.data.sessionId);
    revalidatePath("/cart");
    revalidatePath(`/mypage/orders/${parsed.data.orderId}`);
    return { error: null, ok };
  } catch (error) {
    return paymentFailure(error);
  }
}

export async function cancelUnpaidOrderAction(
  _prev: CheckoutActionState, formData: FormData
): Promise<CheckoutActionState> {
  const parsed = idSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "注文の指定が不正です" };
  await requireUser("/mypage/orders");
  try {
    await cancelOrderPayment(parsed.data);
  } catch (error) {
    return paymentFailure(error);
  }
  revalidatePath(`/mypage/orders/${parsed.data}`);
  return { error: null, ok: true };
}

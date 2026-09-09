"use server";
import { call } from "@/lib/db/functions";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";
import { requireUser } from "@/lib/auth/guards";

export type CheckoutActionState = { error: string | null };
const schema = z.object({
  addressId: idSchema,
  requestId: idSchema,
  note: z.string().max(500).optional(),
});

export async function placeOrderAction(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = schema.safeParse({
    addressId: formData.get("addressId"),
    requestId: formData.get("requestId"),
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  const { db } = await requireUser("/checkout");
  const { data: orderId, error } = await call(db, "place_demo_order", {
    p_address_id: parsed.data.addressId,
    p_request_id: parsed.data.requestId,
    p_note: parsed.data.note,
  });
  if (error || !orderId)
    return { error: error?.message ?? "注文を確定できませんでした" };
  revalidatePath("/cart");
  revalidatePath("/mypage/orders");
  redirect(`/checkout/complete?order=${orderId}`);
}

export async function confirmDemoOrderAction(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = idSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "注文の指定が不正です" };
  const { db } = await requireUser("/mypage/orders");
  const { error } = await call(db, "confirm_demo_order", {
    p_order_id: parsed.data,
  });
  if (error) return { error: error.message };
  revalidatePath("/cart");
  revalidatePath(`/mypage/orders/${parsed.data}`);
  redirect(`/checkout/complete?order=${parsed.data}`);
}

export async function cancelUnpaidOrderAction(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = idSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "注文の指定が不正です" };
  const { db } = await requireUser("/mypage/orders");
  const { error } = await call(db, "cancel_unpaid_order", {
    p_order_id: parsed.data,
  });
  if (error) return { error: error.message };
  revalidatePath(`/mypage/orders/${parsed.data}`);
  return { error: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  addToCartSchema,
  updateCartItemSchema,
  type AddToCartInput,
  type UpdateCartItemInput,
} from "./schema";

export async function addToCart(input: AddToCartInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: product } = await supabase
    .from("products")
    .select("status")
    .eq("id", v.productId)
    .single();
  if (!product || product.status !== "published") {
    return { ok: false, error: "この作品は現在購入できません" };
  }

  let existingQuery = supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", v.productId)
    .eq("filament_id", v.filamentId);
  existingQuery =
    v.nuiSizeId != null
      ? existingQuery.eq("nui_size_id", v.nuiSizeId)
      : existingQuery.is("nui_size_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: Math.min(existing.quantity + v.quantity, 20) })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "カートへの追加に失敗しました" };
  } else {
    const { error } = await supabase.from("cart_items").insert({
      user_id: user.id,
      product_id: v.productId,
      filament_id: v.filamentId,
      nui_size_id: v.nuiSizeId ?? null,
      quantity: v.quantity,
    });
    if (error) return { ok: false, error: "カートへの追加に失敗しました" };
  }

  revalidatePath("/cart");
  return { ok: true, data: undefined };
}

export async function updateCartItem(input: UpdateCartItemInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = updateCartItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("cart_items")
    .update({ quantity: v.quantity })
    .eq("id", v.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "数量の変更に失敗しました" };

  revalidatePath("/cart");
  return { ok: true, data: undefined };
}

export async function removeCartItem(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "削除に失敗しました" };

  revalidatePath("/cart");
  return { ok: true, data: undefined };
}

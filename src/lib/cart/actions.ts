"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type CartActionState = { error: string | null; ok?: boolean };

const addSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
});

/** ログイン中ユーザーのカートID。トリガーで必ず1件あるが、無ければ作る。 */
async function getCartId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * カートに入れる。同じサイズが既に入っていれば数量を足す。
 * 在庫の上限はここで弾く（RLS では数量の妥当性まで見られないため）。
 */
export async function addToCartAction(
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "サイズと数量を確認してください" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: variant } = await supabase
    .from("work_variants")
    .select("id, stock, is_listed, is_printable, work_id")
    .eq("id", parsed.data.variantId)
    .maybeSingle();

  if (!variant || !variant.is_listed || !variant.is_printable) {
    return { error: "このサイズは現在購入できません" };
  }

  const cartId = await getCartId(supabase, user.id);
  if (!cartId) return { error: "カートを用意できませんでした" };

  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("variant_id", variant.id)
    .maybeSingle();

  const nextQuantity = (existing?.quantity ?? 0) + parsed.data.quantity;
  const stock = variant.stock ?? 0;
  if (stock <= 0) return { error: "在庫がありません" };
  if (nextQuantity > stock) {
    return { error: `在庫は残り${stock}点です` };
  }

  // 更新系は必ず select() で行数を見る。RLS で弾かれると
  // エラーにならず0行更新になるため（黙って失敗する）
  const { data: written, error } = existing
    ? await supabase
        .from("cart_items")
        .update({ quantity: nextQuantity })
        .eq("id", existing.id)
        .select("id")
    : await supabase
        .from("cart_items")
        .insert({ cart_id: cartId, variant_id: variant.id, quantity: parsed.data.quantity })
        .select("id");

  if (error || !written || written.length === 0) {
    return { error: "カートに追加できませんでした" };
  }

  revalidatePath("/cart");
  revalidatePath(`/works/${variant.work_id}`);
  return { error: null, ok: true };
}

const quantitySchema = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
});

/** カートの数量を変える。在庫を超える指定はここで弾く。 */
export async function updateCartQuantityAction(
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const parsed = quantitySchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "数量を確認してください" };

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("cart_items")
    .select("id, work_variants!inner(stock)")
    .eq("id", parsed.data.itemId)
    .maybeSingle();

  if (!item) return { error: "カートの中身が見つかりません" };
  const stock = item.work_variants.stock ?? 0;
  if (parsed.data.quantity > stock) return { error: `在庫は残り${stock}点です` };

  const { data, error } = await supabase
    .from("cart_items")
    .update({ quantity: parsed.data.quantity })
    .eq("id", parsed.data.itemId)
    .select("id");

  if (error || !data || data.length === 0) return { error: "数量を変更できませんでした" };
  revalidatePath("/cart");
  return { error: null, ok: true };
}

/** カートから外す。 */
export async function removeCartItemAction(
  _prev: CartActionState,
  formData: FormData
): Promise<CartActionState> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string") return { error: "対象が特定できません" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", itemId)
    .select("id");

  if (error || !data || data.length === 0) return { error: "削除できませんでした" };
  revalidatePath("/cart");
  return { error: null, ok: true };
}

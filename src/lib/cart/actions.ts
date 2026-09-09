"use server";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase, getOptionalUser } from "@/lib/auth/guards";

export type CartActionState = { error: string | null; ok?: boolean };

const addSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
});

/** ログイン中ユーザーのカートID。トリガーで必ず1件あるが、無ければ作る。 */
async function getCartId(
  db: Awaited<ReturnType<typeof getDatabase>>,
  userId: string,
) {
  const { data } = await queryResult(
    db
      .selectFrom("carts")
      .select(["carts.id"])
      .where("carts.user_id", "=", userId)
      .executeTakeFirst(),
  );
  if (data) return data.id;
  const { data: created } = await queryResult(
    db
      .insertInto("carts")
      .values({ user_id: userId })
      .returning(["id"])
      .executeTakeFirstOrThrow(),
  );
  return created?.id ?? null;
}

/**
 * カートに入れる。同じサイズが既に入っていれば数量を足す。
 * 在庫の上限はここで弾く（RLS では数量の妥当性まで見られないため）。
 */
export async function addToCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "サイズと数量を確認してください" };

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: variant } = await queryResult(
    db
      .selectFrom("work_variants")
      .select([
        "work_variants.id",
        "work_variants.stock",
        "work_variants.is_listed",
        "work_variants.is_printable",
        "work_variants.work_id",
      ])
      .where("work_variants.id", "=", parsed.data.variantId)
      .executeTakeFirst(),
  );

  if (!variant || !variant.is_listed || !variant.is_printable) {
    return { error: "このサイズは現在購入できません" };
  }

  const cartId = await getCartId(db, user.id);
  if (!cartId) return { error: "カートを用意できませんでした" };

  const { data: existing } = await queryResult(
    db
      .selectFrom("cart_items")
      .select(["cart_items.id", "cart_items.quantity"])
      .where("cart_items.cart_id", "=", cartId)
      .where("cart_items.variant_id", "=", variant.id)
      .executeTakeFirst(),
  );

  const nextQuantity = (existing?.quantity ?? 0) + parsed.data.quantity;
  const stock = variant.stock ?? 0;
  if (stock <= 0) return { error: "在庫がありません" };
  if (nextQuantity > stock) {
    return { error: `在庫は残り${stock}点です` };
  }

  // 更新系は必ず select() で行数を見る。RLS で弾かれると
  // エラーにならず0行更新になるため（黙って失敗する）
  const { data: written, error } = existing
    ? await queryResult(
        db
          .updateTable("cart_items")
          .set({ quantity: nextQuantity })
          .where("cart_items.id", "=", existing.id)
          .returning(["id"])
          .execute(),
      )
    : await queryResult(
        db
          .insertInto("cart_items")
          .values({
            cart_id: cartId,
            variant_id: variant.id,
            quantity: parsed.data.quantity,
          })
          .returning(["id"])
          .execute(),
      );

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
  formData: FormData,
): Promise<CartActionState> {
  const parsed = quantitySchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "数量を確認してください" };

  const db = await getDatabase();
  const { data: item } = await queryResult(
    db
      .selectFrom("cart_items")
      .select((eb) => [
        "cart_items.id",
        jsonObjectFrom(
          eb
            .selectFrom("work_variants as r0")
            .select(["r0.stock"])
            .whereRef("r0.id", "=", "cart_items.variant_id"),
        )
          .$notNull()
          .as("work_variants"),
      ])
      .where("cart_items.id", "=", parsed.data.itemId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("work_variants as r0")
            .select(["r0.stock"])
            .whereRef("r0.id", "=", "cart_items.variant_id")
            .clearSelect()
            .select("r0.id"),
        ),
      )
      .executeTakeFirst(),
  );

  if (!item) return { error: "カートの中身が見つかりません" };
  const stock = item.work_variants.stock ?? 0;
  if (parsed.data.quantity > stock)
    return { error: `在庫は残り${stock}点です` };

  const { data, error } = await queryResult(
    db
      .updateTable("cart_items")
      .set({ quantity: parsed.data.quantity })
      .where("cart_items.id", "=", parsed.data.itemId)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "数量を変更できませんでした" };
  revalidatePath("/cart");
  return { error: null, ok: true };
}

/** カートから外す。 */
export async function removeCartItemAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string") return { error: "対象が特定できません" };

  const db = await getDatabase();
  const { data, error } = await queryResult(
    db
      .deleteFrom("cart_items")
      .where("cart_items.id", "=", itemId)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "削除できませんでした" };
  revalidatePath("/cart");
  return { error: null, ok: true };
}

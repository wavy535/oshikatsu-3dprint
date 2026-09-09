import "server-only";
import { getOptionalUser } from "@/lib/auth/guards";

export type CartLine = {
  id: string;
  quantity: number;
  variantId: string;
  sizeLabel: string;
  price: number | null;
  goodsPrice: number | null;
  printFee: number | null;
  /** null は無制限 */
  stock: number | null;
  isListed: boolean;
  workId: string;
  workTitle: string;
  imagePath: string | null;
};

/** One query joins ownership, current prices, stock, and accepted private quotes. */
export async function getCart(): Promise<{
  lines: CartLine[];
  subtotal: number;
}> {
  const { db, user } = await getOptionalUser();
  if (!user) return { lines: [], subtotal: 0 };
  const rows = await db
    .selectFrom("cart_items as item")
    .innerJoin("carts as cart", "cart.id", "item.cart_id")
    .innerJoin("work_variants as variant", "variant.id", "item.variant_id")
    .innerJoin("works as work", "work.id", "variant.work_id")
    .leftJoin("work_variant_pricing as price", "price.id", "variant.id")
    .where("cart.user_id", "=", user.id)
    .select((eb) => [
      "item.id",
      "item.quantity",
      "variant.id as variantId",
      "variant.size_label as sizeLabel",
      "variant.stock",
      "work.id as workId",
      "work.title as workTitle",
      "price.buyer_total_jpy as price",
      "price.price_jpy as goodsPrice",
      eb
        .or([
          eb("variant.is_listed", "=", true),
          eb.exists(
            eb
              .selectFrom("custom_order_quotes as quote")
              .select("quote.id")
              .whereRef("quote.variant_id", "=", "variant.id")
              .where("quote.buyer_id", "=", user.id)
              .where("quote.status", "in", ["accepted", "ordered"]),
          ),
        ])
        .as("isListed"),
      eb
        .selectFrom("work_images as image")
        .select("image.storage_path")
        .whereRef("image.work_id", "=", "work.id")
        .orderBy("image.sort_order")
        .limit(1)
        .as("imagePath"),
    ])
    .orderBy("item.created_at")
    .execute();
  const lines: CartLine[] = rows.map((row) => ({
    ...row,
    isListed: Boolean(row.isListed),
    imagePath: row.imagePath ?? null,
    printFee:
      row.price !== null && row.goodsPrice !== null
        ? row.price - row.goodsPrice
        : null,
  }));
  return {
    lines,
    subtotal: lines.reduce(
      (n, line) => n + (line.price ?? 0) * line.quantity,
      0,
    ),
  };
}

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

/**
 * カートの中身。work_variants → works → work_images まで辿る。
 * 価格は work_variants が持つ（作品ではなくサイズが売る単位）。
 */
export async function getCart(): Promise<{ lines: CartLine[]; subtotal: number }> {
  const { supabase, user } = await getOptionalUser();
  if (!user) return { lines: [], subtotal: 0 };

  const { data, error } = await supabase
    .from("cart_items")
    .select(
      `id, quantity, variant_id,
       carts!inner(user_id),
       work_variants!inner(
         id, size_label, price_jpy, stock, is_listed,
         works!inner(id, title, work_images(storage_path, sort_order))
       )`
    )
    .eq("carts.user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error("カートを取得できませんでした");

  // 金額は work_variant_pricing の buyer_total_jpy（作品価格＋印刷代行費）
  const variantIds = (data ?? []).map((r) => r.variant_id);
  const { data: pricing, error: pricingError } = variantIds.length
    ? await supabase
        .from("work_variant_pricing")
        .select("id, price_jpy, buyer_total_jpy")
        .in("id", variantIds)
    : { data: [], error: null };
  if (pricingError) throw new Error("カートの価格を取得できませんでした");
  const pricingById = new Map((pricing ?? []).map((p) => [p.id, p] as const));

  // オーダーメイドで承認した見積りのサイズは is_listed = false だが、本人だけは買える
  const { data: reserved, error: reservedError } = variantIds.length
    ? await supabase
        .from("custom_order_quotes")
        .select("variant_id")
        .eq("buyer_id", user.id)
        .in("status", ["accepted", "ordered"])
        .in("variant_id", variantIds)
    : { data: [], error: null };
  if (reservedError) throw new Error("見積りの購入条件を確認できませんでした");
  const reservedIds = new Set((reserved ?? []).map((r) => r.variant_id));

  const lines: CartLine[] = (data ?? []).map((row) => {
    const v = row.work_variants;
    const w = v.works;
    const pricing = pricingById.get(row.variant_id);
    const price = pricing?.buyer_total_jpy ?? null;
    const goodsPrice = pricing?.price_jpy ?? null;
    const image = [...(w.work_images ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )[0];
    return {
      id: row.id,
      quantity: row.quantity,
      variantId: row.variant_id,
      sizeLabel: v.size_label,
      price,
      goodsPrice,
      printFee: price !== null && goodsPrice !== null ? price - goodsPrice : null,
      stock: v.stock,
      isListed: v.is_listed || reservedIds.has(row.variant_id),
      workId: w.id,
      workTitle: w.title,
      imagePath: image?.storage_path ?? null,
    };
  });

  const subtotal = lines.reduce((n, l) => n + (l.price ?? 0) * l.quantity, 0);
  return { lines, subtotal };
}

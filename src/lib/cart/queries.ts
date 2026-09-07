import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CartLine = {
  id: string;
  quantity: number;
  variantId: string;
  sizeLabel: string;
  price: number | null;
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lines: [], subtotal: 0 };

  const { data } = await supabase
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

  // 金額は work_variant_pricing の buyer_total_jpy（作品価格＋印刷代行費）
  const variantIds = (data ?? []).map((r) => r.variant_id);
  const { data: pricing } = variantIds.length
    ? await supabase
        .from("work_variant_pricing")
        .select("id, buyer_total_jpy")
        .in("id", variantIds)
    : { data: [] };
  const buyerTotalById = new Map((pricing ?? []).map((p) => [p.id, p.buyer_total_jpy] as const));

  const lines: CartLine[] = (data ?? []).map((row) => {
    const v = row.work_variants;
    const w = v.works;
    const image = [...(w.work_images ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )[0];
    return {
      id: row.id,
      quantity: row.quantity,
      variantId: row.variant_id,
      sizeLabel: v.size_label,
      price: buyerTotalById.get(row.variant_id) ?? v.price_jpy,
      stock: v.stock,
      isListed: v.is_listed,
      workId: w.id,
      workTitle: w.title,
      imagePath: image?.storage_path ?? null,
    };
  });

  const subtotal = lines.reduce((n, l) => n + (l.price ?? 0) * l.quantity, 0);
  return { lines, subtotal };
}

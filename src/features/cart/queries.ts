import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * カートの単価は「サイズ展開の価格 + フィラメント追加費」。
 * サイズ展開を持たない作品（旧モデル）だけ base_price にフォールバックする。
 * ここでの計算は create_pending_order の resolve_unit_price と同じ規則。
 */
export async function getCart(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      `id, quantity, created_at, nui_size_id,
       products(id, slug, title, status, base_price,
                product_images(image_url, sort_order),
                product_size_variants(nui_size_id, price, stock, is_active)),
       filaments(id, name, color_hex, surcharge),
       nui_sizes(id, label)`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []).map((row) => {
    const variant = row.products?.product_size_variants?.find(
      (v) => v.nui_size_id === row.nui_size_id
    );
    const basePrice = variant?.price ?? row.products?.base_price ?? 0;
    const unitPrice = basePrice + (row.filaments?.surcharge ?? 0);
    // 在庫割れ・取扱終了はレジに進む前に気づけるよう、行ごとに理由を持たせる
    const unavailableReason = !row.products
      ? "作品が見つかりません"
      : row.products.status !== "published"
        ? "この作品は販売を終了しました"
        : variant && !variant.is_active
          ? `${row.nui_sizes?.label ?? ""}は取扱いが終了しました`
          : variant && variant.stock < row.quantity
            ? `在庫が足りません（残り${variant.stock}点）`
            : null;

    return {
      ...row,
      unitPrice,
      lineTotal: unitPrice * row.quantity,
      stock: variant?.stock ?? null,
      unavailableReason,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const hasBlocker = items.some((item) => item.unavailableReason !== null);
  return { items, subtotal, hasBlocker };
}

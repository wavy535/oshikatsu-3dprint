import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getCart(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      `id, quantity, created_at,
       products(id, slug, title, status, base_price, product_images(image_url, sort_order)),
       filaments(id, name, color_hex, surcharge),
       nui_sizes(id, label)`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []).map((row) => {
    const unitPrice = (row.products?.base_price ?? 0) + (row.filaments?.surcharge ?? 0);
    return {
      ...row,
      unitPrice,
      lineTotal: unitPrice * row.quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items, subtotal };
}

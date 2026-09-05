import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listProductReviews(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      `id, rating, title, body, creator_reply, creator_replied_at, created_at,
       profiles!reviews_user_id_fkey(display_name, avatar_url),
       review_images(id, image_url, sort_order)`
    )
    .eq("product_id", productId)
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// 注文内の各明細について、レビュー投稿済みかどうかを付けて返す
export async function listReviewableOrderItems(orderId: string, buyerId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, order_items(id, product_id, product_title)")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .single();
  if (!order || order.status !== "completed") return [];

  const itemIds = order.order_items.map((i) => i.id);
  if (itemIds.length === 0) return [];

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, order_item_id, rating, title, body, created_at")
    .in("order_item_id", itemIds);

  const byItemId = new Map((reviews ?? []).map((r) => [r.order_item_id, r]));
  const editWindowMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return order.order_items.map((item) => {
    const review = byItemId.get(item.id) ?? null;
    return {
      ...item,
      review,
      editable: !review || now - new Date(review.created_at).getTime() < editWindowMs,
    };
  });
}

export async function listCreatorReviews(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      `id, rating, title, body, creator_reply, creator_replied_at, created_at, is_public,
       profiles!reviews_user_id_fkey(display_name),
       products!reviews_product_id_fkey!inner(title, slug)`
    )
    .eq("products.creator_id", creatorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function adminListReviews() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      `id, rating, title, body, is_public, created_at,
       profiles!reviews_user_id_fkey(display_name),
       products!reviews_product_id_fkey(title, slug)`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

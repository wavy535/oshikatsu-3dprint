import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CoordinateFilters = {
  page?: number;
  perPage?: number;
};

export async function listCoordinates(filters: CoordinateFilters = {}) {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 24;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await supabase
    .from("coordinates")
    .select("id, title, cover_image_url, like_count, created_at, profiles!coordinates_user_id_fkey(display_name, handle)", {
      count: "exact",
    })
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { items: data ?? [], totalCount: count ?? 0 };
}

export async function getCoordinate(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coordinates")
    .select(
      `*,
       profiles!coordinates_user_id_fkey(display_name, handle, avatar_url),
       coordinate_images(id, image_url, sort_order),
       coordinate_items(id, product_id, pin_x, pin_y, note, sort_order, products(title, slug, base_price))`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) return null;
  return data;
}

export async function listMyCoordinates(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coordinates")
    .select("id, title, cover_image_url, is_public, like_count, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCoordinatesByProduct(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coordinate_items")
    .select(
      `coordinate_id,
       coordinates!inner(id, title, cover_image_url, is_public, deleted_at)`
    )
    .eq("product_id", productId)
    .eq("coordinates.is_public", true)
    .is("coordinates.deleted_at", null);
  if (error) throw error;
  return data.map((r) => r.coordinates);
}

export async function isCoordinateLiked(coordinateId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("coordinate_likes")
    .select("user_id")
    .eq("coordinate_id", coordinateId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listMyProducts(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, title, status, base_price, created_at")
    .eq("creator_id", creatorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyProductForEdit(id: string, creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*,
       product_nui_sizes(nui_size_id),
       product_tags(tag_id),
       product_filaments(filament_id, is_default)`
    )
    .eq("id", id)
    .eq("creator_id", creatorId)
    .single();
  if (error) throw error;
  return data;
}

/** 作品投稿 4STEP で使う下書き一式（本人の作品のみ） */
export async function getProductDraft(id: string, creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*,
       product_assets(id, original_name, file_ext, part_label, quantity_per_item, sort_order,
                      layer_direction, support_type, color_slot, filament_id, print_note),
       product_asset_validations(asset_id, passed, checks, triangle_count,
                                 bbox_w_mm, bbox_d_mm, bbox_h_mm, shell_count),
       product_size_variants(nui_size_id, price, stock, agency_fee, est_weight_g, est_print_min,
                             is_active, unavailable_reason),
       product_images(id, image_url, alt, sort_order),
       product_tags(tag_id),
       product_filaments(filament_id, is_default)`
    )
    .eq("id", id)
    .eq("creator_id", creatorId)
    .single();
  if (error) return null;
  return data;
}

export async function listProductAssets(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_assets")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listProductImages(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listTags() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, kind")
    .eq("is_active", true);
  if (error) throw error;
  return data;
}

export async function listFilaments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filaments")
    .select("id, name, material, color_name, color_hex, surcharge")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

// DESIGN.md §6.3.C ProductFilters
export type ProductFilters = {
  q?: string;
  categoryId?: number;
  tagIds?: number[];
  nuiSizeIds?: number[];
  filamentIds?: number[];
  priceMin?: number;
  priceMax?: number;
  creatorHandle?: string;
  sort?: "newest" | "popular" | "price_asc" | "price_desc" | "rating";
  page?: number;
  perPage?: number;
};

export async function searchProducts(filters: ProductFilters) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_products", {
    p_q: filters.q || undefined,
    p_category_id: filters.categoryId,
    p_tag_ids: filters.tagIds?.length ? filters.tagIds : undefined,
    p_nui_size_ids: filters.nuiSizeIds?.length ? filters.nuiSizeIds : undefined,
    p_filament_ids: filters.filamentIds?.length ? filters.filamentIds : undefined,
    p_price_min: filters.priceMin,
    p_price_max: filters.priceMax,
    p_creator_handle: filters.creatorHandle || undefined,
    p_sort: filters.sort ?? "newest",
    p_page: filters.page ?? 1,
    p_per_page: filters.perPage ?? 24,
  });
  if (error) throw error;
  return {
    items: data ?? [],
    totalCount: data?.[0]?.total_count ?? 0,
  };
}

export async function getProductBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*,
       profiles!products_creator_id_fkey(handle, display_name, avatar_url),
       product_images(id, image_url, alt, sort_order),
       product_nui_sizes(nui_sizes(id, label)),
       product_size_variants(nui_size_id, price, stock, agency_fee, est_weight_g, est_print_min, is_active, unavailable_reason),
       product_filaments(is_default, filaments(id, name, color_hex, surcharge))`
    )
    .eq("slug", slug)
    .single();
  if (error) return null;
  return data;
}

export async function isFavorited(userId: string, productId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  return Boolean(data);
}

export async function getCreatorByHandle(handle: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, bio")
    .eq("handle", handle)
    .single();
  if (error) return null;
  return data;
}

export async function listPublishedProductsByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, slug, title, base_price, review_count, review_avg, favorite_count,
       product_images(image_url, sort_order),
       product_size_variants(nui_size_id, is_active)`
    )
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data;
}

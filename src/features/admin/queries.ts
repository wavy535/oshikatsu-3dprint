import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export async function adminListOrders(filters: { status?: OrderStatus } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, status, total, buyer_id, created_at, paid_at")
    .order("created_at", { ascending: false });
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function adminGetOrder(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, order_items(*), shipments(*), profiles!orders_buyer_id_fkey(handle, display_name)`)
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function adminGetProductionSheet(orderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_production_sheets")
    .select("*")
    .eq("order_id", orderId);
  if (error) throw error;
  return data;
}

export async function listPendingCreatorApplications() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("*, profiles!creator_profiles_user_id_fkey(handle, display_name, avatar_url)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listProductsInReview() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, title, base_price, created_at, profiles!products_creator_id_fkey(handle, display_name)")
    .eq("status", "in_review")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function adminGetProductForReview(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*,
       product_images(id, image_url, sort_order),
       product_assets(id, original_name, file_ext, file_size, part_label),
       product_nui_sizes(nui_sizes(label)),
       product_filaments(is_default, filaments(name, color_hex)),
       profiles!products_creator_id_fkey(handle, display_name)`
    )
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

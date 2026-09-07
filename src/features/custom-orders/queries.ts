import "server-only";
import { createClient } from "@/lib/supabase/server";

export const CUSTOM_ORDER_STATUS_LABEL: Record<string, string> = {
  requested: "見積り待ち",
  quoted: "見積り提示中",
  approved: "承認済み（決済待ち）",
  rejected: "見送り",
  paid: "決済済み",
  cancelled: "キャンセル",
};

const SELECT = `id, status, nui_size_id, color_note, finish_note, request_note, desired_date,
   quote_price, quote_filament_g, quote_print_min, quote_part_count, quote_lead_days,
   quote_spec, quote_note, quoted_at, approved_at, order_id, thread_id, created_at,
   products(id, slug, title, product_images(image_url, sort_order)),
   nui_sizes(label),
   buyer:profiles!custom_orders_buyer_id_fkey(id, handle, display_name, avatar_url),
   creator:profiles!custom_orders_creator_id_fkey(id, handle, display_name, avatar_url)`;

export async function listMyCustomOrders(buyerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_orders")
    .select(SELECT)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCreatorCustomOrders(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_orders")
    .select(SELECT)
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** RLS が buyer / creator / admin に絞るので、ここでは id だけで引く */
export async function getCustomOrder(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_orders")
    .select(SELECT)
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

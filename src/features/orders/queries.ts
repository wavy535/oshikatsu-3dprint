import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listMyOrders(buyerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyOrder(id: string, buyerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `*,
       order_items(*, products(slug)),
       shipments(*),
       print_jobs(id, order_item_id, status, due_at)`
    )
    .eq("id", id)
    .eq("buyer_id", buyerId)
    .single();
  if (error) return null;
  return data;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listMyAddresses(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_addresses")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

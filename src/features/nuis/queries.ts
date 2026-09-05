import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listMyNuis(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_nuis")
    .select("*, nui_sizes(id, label, height_mm)")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listNuiSizes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nui_sizes")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

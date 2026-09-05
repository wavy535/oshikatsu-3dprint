import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getMyProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getMyCreatorProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("creator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

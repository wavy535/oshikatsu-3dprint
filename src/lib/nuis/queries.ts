import "server-only";
import { requireUser } from "@/lib/auth/guards";

/** 自分のマイぬい。メインを先頭に、あとは登録順。 */
export async function listMyNuis() {
  const { supabase, user } = await requireUser("/mypage/nuis");
  const { data } = await supabase
    .from("nui_profiles")
    .select("id, name, kind, sit_height_mm, shoulder_width_mm, hug_width_mm, nui_size_cm, is_main, created_at")
    .eq("user_id", user.id)
    .order("is_main", { ascending: false })
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getMyNui(id: string) {
  const { supabase, user } = await requireUser("/mypage/nuis");
  const { data } = await supabase
    .from("nui_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * DESIGN.md §8.5 準拠。getSession() はクッキーの内容をそのまま返すため
 * 改竄検知ができない。サーバー側の権限判定には必ず getUser()
 * （Auth サーバーへ検証をかける）を使う。
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// 公開ページ（🔓）用: 未ログインでもリダイレクトせず null を返す
export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireCreator() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("creator_profiles")
    .select("status")
    .eq("user_id", user.id)
    .single();
  if (data?.status !== "approved") redirect("/creator/apply");
  return { supabase, user };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  // 403 ではなく 404（管理画面の存在を隠す）
  if (data?.role !== "admin") notFound();
  return { supabase, user };
}

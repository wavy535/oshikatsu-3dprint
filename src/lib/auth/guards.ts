import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * ページ側の権限判定。
 *
 * `getSession()` はクッキーの内容をそのまま返すので改竄を検知できない。
 * サーバー側の判定には必ず `getUser()`（Auth サーバーへ検証をかける）を使う。
 * proxy.ts のリダイレクトは体験のためのもので、権限の担保はここと RLS が持つ。
 */
export async function requireUser(redirectTo?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login");
  }
  return { supabase, user };
}

/** 公開ページ用。未ログインでもリダイレクトせず null を返す。 */
export async function getOptionalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * クリエイター向け画面。
 * profiles.role は承認トリガー（0004）だけが creator へ上げるので、ここはそれを見る。
 */
export async function requireCreator() {
  const { supabase, user } = await requireUser("/studio");
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (data?.role !== "creator" && data?.role !== "admin") redirect("/creator/apply");
  return { supabase, user };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser("/admin");
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  // 403 ではなく 404 を返す（管理画面の存在を隠す）
  if (data?.role !== "admin") notFound();
  return { supabase, user };
}

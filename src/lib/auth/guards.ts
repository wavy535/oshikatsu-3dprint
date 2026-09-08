import "server-only";
import { cache } from "react";
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
  const { supabase, user } = await getOptionalUser();
  if (!user) {
    redirect(redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login");
  }
  return { supabase, user };
}

/** 公開ページ用。未ログインでもリダイレクトせず null を返す。 */
export const getOptionalUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

/** Reactのリクエスト内キャッシュ。別リクエスト・別ユーザーとは共有しない。 */
export const getUserProfile = cache(async () => {
  const { supabase, user } = await getOptionalUser();
  if (!user) return { supabase, user, profile: null };
  const { data: profile, error } = await supabase.from("profiles")
    .select("role, display_name, avatar_url").eq("id", user.id).maybeSingle();
  if (error) throw new Error("プロフィールを取得できませんでした");
  return { supabase, user, profile };
});

/**
 * クリエイター向け画面。
 * profiles.role は承認トリガー（0004）だけが creator へ上げるので、ここはそれを見る。
 */
export async function requireCreator() {
  const { supabase, user } = await requireUser("/studio");
  const { profile } = await getUserProfile();
  if (profile?.role !== "creator" && profile?.role !== "admin") redirect("/creator/apply");
  return { supabase, user, profile };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser("/admin");
  const { profile } = await getUserProfile();
  // 403 ではなく 404 を返す（管理画面の存在を隠す）
  if (profile?.role !== "admin") notFound();
  return { supabase, user, profile };
}

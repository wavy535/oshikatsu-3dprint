import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getOptionalUser } from "@/lib/auth/guards";

/**
 * 公開プロフィール。数字（作品数・フォロワー・販売実績・評価）は DB の関数が出す
 * （販売実績は order_items から出すので、買う人には読めない → definer 関数）。
 */
export async function getCreatorProfile(creatorId: string) {
  const { supabase, user } = await getOptionalUser();

  const [{ data: profile }, { data: stats }, { data: rating }, followRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, sns_links, role, created_at")
      .eq("id", creatorId)
      .in("role", ["creator", "admin"])
      .maybeSingle(),
    supabase.rpc("creator_public_stats", { p_creator_id: creatorId }).maybeSingle(),
    supabase.from("creator_rating_summary").select("*").eq("creator_id", creatorId).maybeSingle(),
    user
      ? supabase
          .from("creator_follows")
          .select("creator_id")
          .eq("creator_id", creatorId)
          .eq("follower_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!profile) return null;

  return {
    profile,
    stats,
    rating,
    isFollowing: !!followRes.data,
    viewerId: user?.id ?? null,
  };
}

/** クリエイターへのレビュー（全作品）。公開プロフィールの「レビュー」タブ。 */
export async function listCreatorReviews(creatorId: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      `id, rating, comment, created_at, is_anonymous,
       profiles!reviews_reviewer_id_fkey(display_name, avatar_url),
       works(id, title), order_items(size_label_snapshot)`
    )
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** SNS リンク（profiles.sns_links）。{ x: url, instagram: url, ... } を並べる。 */
export function snsEntries(links: unknown): { key: string; label: string; url: string }[] {
  if (!links || typeof links !== "object") return [];
  const LABEL: Record<string, string> = {
    x: "X (Twitter)",
    twitter: "X (Twitter)",
    instagram: "Instagram",
    youtube: "YouTube",
    pixiv: "pixiv",
    booth: "BOOTH",
    website: "Webサイト",
  };
  return Object.entries(links as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && /^https?:\/\//.test(v))
    .map(([k, v]) => ({ key: k, label: LABEL[k] ?? k, url: v as string }));
}

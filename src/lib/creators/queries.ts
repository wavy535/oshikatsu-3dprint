import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult, firstResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import { sql } from "kysely";
import "server-only";

import { getDatabase, getOptionalUser } from "@/lib/auth/guards";

/**
 * 公開プロフィール。数字（作品数・フォロワー・販売実績・評価）は DB の関数が出す
 * （販売実績は order_items から出すので、買う人には読めない → definer 関数）。
 */
export async function getCreatorProfile(creatorId: string) {
  const { db, user } = await getOptionalUser();

  const [{ data: profile }, { data: stats }, { data: rating }, followRes] =
    await Promise.all([
      queryResult(
        db
          .selectFrom("profiles")
          .select([
            "profiles.id",
            "profiles.display_name",
            "profiles.avatar_url",
            "profiles.bio",
            "profiles.sns_links",
            "profiles.role",
            "profiles.created_at",
          ])
          .where("profiles.id", "=", creatorId)
          .where(
            sql<boolean>`${sql.ref("profiles.role")} = any(${["creator", "admin"]})`,
          )
          .executeTakeFirst(),
      ),
      firstResult(
        call(db, "creator_public_stats", { p_creator_id: creatorId }),
      ),
      queryResult(
        db
          .selectFrom("creator_rating_summary")
          .selectAll("creator_rating_summary")
          .where("creator_rating_summary.creator_id", "=", creatorId)
          .executeTakeFirst(),
      ),
      user
        ? queryResult(
            db
              .selectFrom("creator_follows")
              .select(["creator_follows.creator_id"])
              .where("creator_follows.creator_id", "=", creatorId)
              .where("creator_follows.follower_id", "=", user.id)
              .executeTakeFirst(),
          )
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
  const db = await getDatabase();
  const { data } = await queryResult(
    db
      .selectFrom("reviews")
      .select((eb) => [
        "reviews.id",
        "reviews.rating",
        "reviews.comment",
        "reviews.created_at",
        "reviews.is_anonymous",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r0")
            .select(["r0.display_name", "r0.avatar_url"])
            .whereRef("r0.id", "=", "reviews.reviewer_id"),
        ).as("profiles"),
        jsonObjectFrom(
          eb
            .selectFrom("works as r1")
            .select(["r1.id", "r1.title"])
            .whereRef("r1.id", "=", "reviews.work_id"),
        ).as("works"),
        jsonObjectFrom(
          eb
            .selectFrom("order_items as r2")
            .select(["r2.size_label_snapshot"])
            .whereRef("r2.id", "=", "reviews.order_item_id"),
        ).as("order_items"),
      ])
      .where("reviews.creator_id", "=", creatorId)
      .orderBy("reviews.created_at", "desc")
      .limit(limit)
      .execute(),
  );
  return data ?? [];
}

/** SNS リンク（profiles.sns_links）。{ x: url, instagram: url, ... } を並べる。 */
export function snsEntries(
  links: unknown,
): { key: string; label: string; url: string }[] {
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

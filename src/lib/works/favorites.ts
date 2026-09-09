"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";

import { getOptionalUser } from "@/lib/auth/guards";

export type FavoriteState = { error: string | null; favorited: boolean };

/**
 * お気に入りの追加・解除。
 * works.favorite_count は sync_work_favorite_count トリガーが追随するので、
 * アプリ側では数えない。
 */
export async function toggleFavoriteAction(
  prev: FavoriteState,
  formData: FormData,
): Promise<FavoriteState> {
  const workId = formData.get("workId");
  if (typeof workId !== "string")
    return { ...prev, error: "作品が特定できません" };

  const { db, user } = await getOptionalUser();
  if (!user) return { ...prev, error: "ログインが必要です" };

  if (prev.favorited) {
    const { data, error } = await queryResult(
      db
        .deleteFrom("work_favorites")
        .where("work_favorites.work_id", "=", workId)
        .where("work_favorites.user_id", "=", user.id)
        .returning(["work_id"])
        .execute(),
    );
    if (error || !data || data.length === 0)
      return { ...prev, error: "解除できませんでした" };
    revalidatePath(`/works/${workId}`);
    return { error: null, favorited: false };
  }

  const { data, error } = await queryResult(
    db
      .insertInto("work_favorites")
      .values({ work_id: workId, user_id: user.id })
      .returning(["work_id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { ...prev, error: "追加できませんでした" };
  revalidatePath(`/works/${workId}`);
  return { error: null, favorited: true };
}

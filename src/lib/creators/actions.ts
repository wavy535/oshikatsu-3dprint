"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guards";

export type FollowActionState = { error: string | null; following?: boolean };

/** フォロー／解除。行があれば消す、無ければ入れる。 */
export async function toggleFollowAction(
  _prev: FollowActionState,
  formData: FormData,
): Promise<FollowActionState> {
  const creatorId = String(formData.get("creatorId") ?? "");
  if (!creatorId) return { error: "クリエイターが指定されていません" };

  const { db, user } = await requireUser(`/creators/${creatorId}`);
  if (creatorId === user.id) return { error: "自分はフォローできません" };

  const { data: existing } = await queryResult(
    db
      .selectFrom("creator_follows")
      .select(["creator_follows.creator_id"])
      .where("creator_follows.creator_id", "=", creatorId)
      .where("creator_follows.follower_id", "=", user.id)
      .executeTakeFirst(),
  );

  if (existing) {
    const { error } = await queryResult(
      db
        .deleteFrom("creator_follows")
        .where("creator_follows.creator_id", "=", creatorId)
        .where("creator_follows.follower_id", "=", user.id)
        .returning(["creator_id"])
        .execute(),
    );
    if (error) return { error: "解除できませんでした" };
    revalidatePath(`/creators/${creatorId}`);
    return { error: null, following: false };
  }

  const { error } = await queryResult(
    db
      .insertInto("creator_follows")
      .values({ creator_id: creatorId, follower_id: user.id })
      .returning(["creator_id"])
      .execute(),
  );
  if (error) return { error: "フォローできませんでした" };
  revalidatePath(`/creators/${creatorId}`);
  return { error: null, following: true };
}

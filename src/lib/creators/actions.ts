"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guards";

export type FollowActionState = { error: string | null; following?: boolean };

/** フォロー／解除。行があれば消す、無ければ入れる。 */
export async function toggleFollowAction(
  _prev: FollowActionState,
  formData: FormData
): Promise<FollowActionState> {
  const creatorId = String(formData.get("creatorId") ?? "");
  if (!creatorId) return { error: "クリエイターが指定されていません" };

  const { supabase, user } = await requireUser(`/creators/${creatorId}`);
  if (creatorId === user.id) return { error: "自分はフォローできません" };

  const { data: existing } = await supabase
    .from("creator_follows")
    .select("creator_id")
    .eq("creator_id", creatorId)
    .eq("follower_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("creator_follows")
      .delete()
      .eq("creator_id", creatorId)
      .eq("follower_id", user.id)
      .select("creator_id");
    if (error) return { error: "解除できませんでした" };
    revalidatePath(`/creators/${creatorId}`);
    return { error: null, following: false };
  }

  const { error } = await supabase
    .from("creator_follows")
    .insert({ creator_id: creatorId, follower_id: user.id })
    .select("creator_id");
  if (error) return { error: "フォローできませんでした" };
  revalidatePath(`/creators/${creatorId}`);
  return { error: null, following: true };
}

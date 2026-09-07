"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type FavoriteState = { error: string | null; favorited: boolean };

/**
 * お気に入りの追加・解除。
 * works.favorite_count は sync_work_favorite_count トリガーが追随するので、
 * アプリ側では数えない。
 */
export async function toggleFavoriteAction(
  prev: FavoriteState,
  formData: FormData
): Promise<FavoriteState> {
  const workId = formData.get("workId");
  if (typeof workId !== "string") return { ...prev, error: "作品が特定できません" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...prev, error: "ログインが必要です" };

  if (prev.favorited) {
    const { data, error } = await supabase
      .from("work_favorites")
      .delete()
      .eq("work_id", workId)
      .eq("user_id", user.id)
      .select("work_id");
    if (error || !data || data.length === 0) return { ...prev, error: "解除できませんでした" };
    revalidatePath(`/works/${workId}`);
    return { error: null, favorited: false };
  }

  const { data, error } = await supabase
    .from("work_favorites")
    .insert({ work_id: workId, user_id: user.id })
    .select("work_id");
  if (error || !data || data.length === 0) return { ...prev, error: "追加できませんでした" };
  revalidatePath(`/works/${workId}`);
  return { error: null, favorited: true };
}

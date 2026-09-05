"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import { upsertNuiSchema, type UpsertNuiInput } from "./schema";

export async function upsertNui(input: UpsertNuiInput): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();

  const parsed = upsertNuiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const row = {
    user_id: user.id,
    name: v.name,
    nui_size_id: v.nuiSizeId,
    custom_height_mm: v.customHeightMm ?? null,
    note: v.note || null,
  };

  const query = v.id
    ? supabase.from("user_nuis").update(row).eq("id", v.id).eq("user_id", user.id).select("id").single()
    : supabase.from("user_nuis").insert(row).select("id").single();

  const { data, error } = await query;
  if (error || !data) {
    return { ok: false, error: "マイぬいの保存に失敗しました" };
  }

  revalidatePath("/mypage/nuis");
  return { ok: true, data: { id: data.id } };
}

export async function deleteNui(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("user_nuis").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    return { ok: false, error: "削除に失敗しました" };
  }

  revalidatePath("/mypage/nuis");
  return { ok: true, data: undefined };
}

export async function setPrimaryNui(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  // 部分ユニークインデックス（1ユーザー1主役ぬい）に抵触しないよう、
  // 先に全解除してから対象のみ設定する（DESIGN.md §4.4.1）。
  const { error: unsetError } = await supabase
    .from("user_nuis")
    .update({ is_primary: false })
    .eq("user_id", user.id)
    .eq("is_primary", true);
  if (unsetError) {
    return { ok: false, error: "主役ぬいの更新に失敗しました" };
  }

  const { error: setError } = await supabase
    .from("user_nuis")
    .update({ is_primary: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (setError) {
    return { ok: false, error: "主役ぬいの更新に失敗しました" };
  }

  revalidatePath("/mypage/nuis");
  return { ok: true, data: undefined };
}

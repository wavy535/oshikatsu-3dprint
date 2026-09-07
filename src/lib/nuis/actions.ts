"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type NuiActionState = { error: string | null };

/**
 * 採寸値。相性判定（nui_fit_axes）はこの3つだけを見るので、
 * 座高は必須、肩幅と抱き幅は任意にしてある（未入力の軸は unknown 判定になる）。
 * サイズ区分（nui_size_cm）は座高からトリガーが埋めるので入力させない。
 */
const nuiSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1, "名前を入力してください").max(40),
  kind: z.enum(["plush", "acrylic_stand", "figure", "other"]),
  sitHeightMm: z.coerce.number().positive("座高を入力してください").max(1000),
  shoulderWidthMm: z.coerce.number().positive().max(1000).optional(),
  hugWidthMm: z.coerce.number().positive().max(1000).optional(),
});

function parse(formData: FormData) {
  const num = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  return nuiSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    kind: formData.get("kind"),
    sitHeightMm: num("sitHeightMm"),
    shoulderWidthMm: num("shoulderWidthMm"),
    hugWidthMm: num("hugWidthMm"),
  });
}

export async function saveNuiAction(
  _prev: NuiActionState,
  formData: FormData
): Promise<NuiActionState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  const values = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    sit_height_mm: parsed.data.sitHeightMm,
    shoulder_width_mm: parsed.data.shoulderWidthMm ?? null,
    hug_width_mm: parsed.data.hugWidthMm ?? null,
  };

  const { data, error } = parsed.data.id
    ? await supabase
        .from("nui_profiles")
        .update(values)
        .eq("id", parsed.data.id)
        .eq("user_id", user.id)
        .select("id")
    : await supabase
        .from("nui_profiles")
        .insert({ ...values, user_id: user.id })
        .select("id");

  if (error || !data || data.length === 0) return { error: "保存できませんでした" };

  revalidatePath("/mypage/nuis");
  redirect("/mypage/nuis");
}

/** メインを切り替える。一覧の絞り込みの既定と作品詳細の相性はメインを見る。 */
export async function setMainNuiAction(
  _prev: NuiActionState,
  formData: FormData
): Promise<NuiActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  await supabase.from("nui_profiles").update({ is_main: false }).eq("user_id", user.id);
  const { data, error } = await supabase
    .from("nui_profiles")
    .update({ is_main: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error || !data || data.length === 0) return { error: "切り替えられませんでした" };
  revalidatePath("/mypage/nuis");
  revalidatePath("/works");
  return { error: null };
}

export async function deleteNuiAction(
  _prev: NuiActionState,
  formData: FormData
): Promise<NuiActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("nui_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error || !data || data.length === 0) return { error: "削除できませんでした" };
  revalidatePath("/mypage/nuis");
  return { error: null };
}

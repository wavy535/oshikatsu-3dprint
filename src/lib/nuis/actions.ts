"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";

export type NuiActionState = { error: string | null };

/**
 * 採寸値。必須は身長だけで、座高・肩幅・抱き幅は任意にしてある。
 * 相性判定（nui_fit_axes）と AR は、入力がない値を身長から推定する（nui_sit_height_mm / nui_width_mm）。
 * サイズ区分（nui_size_cm）は身長からトリガーが埋めるので入力させない。
 */
const nuiSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1, "名前を入力してください").max(40),
  kind: z.enum(["plush", "acrylic_stand", "figure", "other"]),
  heightMm: z.coerce.number().positive("身長を入力してください").max(1000),
  sitHeightMm: z.coerce.number().positive().max(1000).optional(),
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
    heightMm: num("heightMm"),
    sitHeightMm: num("sitHeightMm"),
    shoulderWidthMm: num("shoulderWidthMm"),
    hugWidthMm: num("hugWidthMm"),
  });
}

export async function saveNuiAction(
  _prev: NuiActionState,
  formData: FormData,
): Promise<NuiActionState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  const values = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    height_mm: parsed.data.heightMm,
    sit_height_mm: parsed.data.sitHeightMm ?? null,
    shoulder_width_mm: parsed.data.shoulderWidthMm ?? null,
    hug_width_mm: parsed.data.hugWidthMm ?? null,
  };

  const { data, error } = parsed.data.id
    ? await queryResult(
        db
          .updateTable("nui_profiles")
          .set(values)
          .where("nui_profiles.id", "=", parsed.data.id)
          .where("nui_profiles.user_id", "=", user.id)
          .returning(["id"])
          .execute(),
      )
    : await queryResult(
        db
          .insertInto("nui_profiles")
          .values({ ...values, user_id: user.id })
          .returning(["id"])
          .execute(),
      );

  if (error || !data || data.length === 0)
    return { error: "保存できませんでした" };

  revalidatePath("/mypage/nuis");
  redirect("/mypage/nuis");
}

/** メインを切り替える。一覧の絞り込みの既定と作品詳細の相性はメインを見る。 */
export async function setMainNuiAction(
  _prev: NuiActionState,
  formData: FormData,
): Promise<NuiActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  await queryResult(
    db
      .updateTable("nui_profiles")
      .set({ is_main: false })
      .where("nui_profiles.user_id", "=", user.id)
      .execute(),
  );
  const { data, error } = await queryResult(
    db
      .updateTable("nui_profiles")
      .set({ is_main: true })
      .where("nui_profiles.id", "=", id)
      .where("nui_profiles.user_id", "=", user.id)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "切り替えられませんでした" };
  revalidatePath("/mypage/nuis");
  revalidatePath("/works");
  return { error: null };
}

export async function deleteNuiAction(
  _prev: NuiActionState,
  formData: FormData,
): Promise<NuiActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  const { data, error } = await queryResult(
    db
      .deleteFrom("nui_profiles")
      .where("nui_profiles.id", "=", id)
      .where("nui_profiles.user_id", "=", user.id)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "削除できませんでした" };
  revalidatePath("/mypage/nuis");
  return { error: null };
}

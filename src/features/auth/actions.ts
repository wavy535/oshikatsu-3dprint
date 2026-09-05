"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  applyCreatorSchema,
  updateProfileSchema,
  type ApplyCreatorInput,
  type UpdateProfileInput,
} from "./schema";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      handle: v.handle,
      display_name: v.displayName,
      bio: v.bio || null,
      email_opt_in: v.emailOptIn,
    })
    .eq("id", user.id);

  if (error) {
    // handle の unique 制約違反
    if (error.code === "23505") {
      return {
        ok: false,
        error: "入力エラー",
        fieldErrors: { handle: ["このハンドルは既に使用されています"] },
      };
    }
    return { ok: false, error: "プロフィールの更新に失敗しました" };
  }

  revalidatePath("/mypage");
  return { ok: true, data: undefined };
}

export async function updateAvatar(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const { supabase, user } = await requireUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "画像を選択してください" };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "画像サイズは5MB以下にしてください" };
  }
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "対応していない画像形式です（jpeg/png/webp）" };
  }

  const ext = file.type.split("/")[1];
  const path = `${user.id}/avatar/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("user-content")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, error: "画像のアップロードに失敗しました" };
  }

  const { data: pub } = supabase.storage.from("user-content").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: pub.publicUrl })
    .eq("id", user.id);
  if (updateError) {
    return { ok: false, error: "プロフィールの更新に失敗しました" };
  }

  revalidatePath("/mypage");
  return { ok: true, data: { url: pub.publicUrl } };
}

export async function applyCreator(input: ApplyCreatorInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = applyCreatorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase.from("creator_profiles").insert({
    user_id: user.id,
    legal_name: v.legalName,
    legal_name_kana: v.legalNameKana,
    birth_date: v.birthDate,
    intro: v.intro || null,
    portfolio_url: v.portfolioUrl || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "既にクリエイター申請が提出されています" };
    }
    return { ok: false, error: "申請に失敗しました" };
  }

  revalidatePath("/mypage");
  return { ok: true, data: undefined };
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

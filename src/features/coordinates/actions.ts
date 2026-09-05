"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  upsertCoordinateSchema,
  setCoordinateItemsSchema,
  type UpsertCoordinateInput,
  type SetCoordinateItemsInput,
} from "./schema";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function createCoordinate(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();

  const nuiSizeIdRaw = formData.get("nuiSizeId");
  const parsed = upsertCoordinateSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    userNuiId: String(formData.get("userNuiId") ?? ""),
    nuiSizeId: nuiSizeIdRaw ? Number(nuiSizeIdRaw) : undefined,
    isPublic: formData.get("isPublic") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const file = formData.get("coverImage");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "カバー画像を選択してください" };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "画像サイズは5MB以下にしてください" };
  }
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "対応していない画像形式です（jpeg/png/webp）" };
  }

  const ext = file.type.split("/")[1];
  const path = `${user.id}/coordinate/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("user-content")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, error: "画像のアップロードに失敗しました" };
  }
  const { data: pub } = supabase.storage.from("user-content").getPublicUrl(path);

  const { data, error } = await supabase
    .from("coordinates")
    .insert({
      user_id: user.id,
      title: v.title,
      body: v.body || null,
      cover_image_url: pub.publicUrl,
      user_nui_id: v.userNuiId || null,
      nui_size_id: v.nuiSizeId ?? null,
      is_public: v.isPublic,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "投稿に失敗しました" };

  revalidatePath("/mypage/coordinates");
  revalidatePath("/coordinates");
  return { ok: true, data: { id: data.id } };
}

export async function updateCoordinateDetails(input: UpsertCoordinateInput): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const parsed = upsertCoordinateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;
  if (!v.id) return { ok: false, error: "更新対象が指定されていません" };

  const { error } = await supabase
    .from("coordinates")
    .update({
      title: v.title,
      body: v.body || null,
      user_nui_id: v.userNuiId || null,
      nui_size_id: v.nuiSizeId ?? null,
      is_public: v.isPublic,
    })
    .eq("id", v.id);
  if (error) return { ok: false, error: "更新に失敗しました" };

  revalidatePath(`/coordinates/${v.id}`);
  revalidatePath(`/mypage/coordinates/${v.id}/edit`);
  revalidatePath("/mypage/coordinates");
  return { ok: true, data: undefined };
}

export async function deleteCoordinate(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("coordinates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました" };

  revalidatePath("/mypage/coordinates");
  revalidatePath("/coordinates");
  return { ok: true, data: undefined };
}

export async function uploadCoordinateImage(
  coordinateId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "画像を選択してください" };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "画像サイズは5MB以下にしてください" };
  }
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "対応していない画像形式です（jpeg/png/webp）" };
  }

  const ext = file.type.split("/")[1];
  const path = `${user.id}/coordinate/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("user-content")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, error: "アップロードに失敗しました（投稿の所有者を確認してください）" };
  }
  const { data: pub } = supabase.storage.from("user-content").getPublicUrl(path);

  const { data, error } = await supabase
    .from("coordinate_images")
    .insert({ coordinate_id: coordinateId, image_url: pub.publicUrl })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "画像の登録に失敗しました" };

  revalidatePath(`/mypage/coordinates/${coordinateId}/edit`);
  revalidatePath(`/coordinates/${coordinateId}`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteCoordinateImage(imageId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { data: image } = await supabase
    .from("coordinate_images")
    .select("id, coordinate_id, image_url")
    .eq("id", imageId)
    .single();
  if (!image) return { ok: false, error: "画像が見つかりません" };

  const { error } = await supabase.from("coordinate_images").delete().eq("id", imageId);
  if (error) return { ok: false, error: "削除に失敗しました" };

  const path = image.image_url.split("/user-content/").pop();
  if (path) {
    await supabase.storage.from("user-content").remove([path]);
  }

  revalidatePath(`/mypage/coordinates/${image.coordinate_id}/edit`);
  revalidatePath(`/coordinates/${image.coordinate_id}`);
  return { ok: true, data: undefined };
}

export async function setCoordinateItems(input: SetCoordinateItemsInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = setCoordinateItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: coordinate } = await supabase
    .from("coordinates")
    .select("user_id")
    .eq("id", v.coordinateId)
    .single();
  if (!coordinate || coordinate.user_id !== user.id) {
    return { ok: false, error: "権限がありません" };
  }

  const { error: delError } = await supabase
    .from("coordinate_items")
    .delete()
    .eq("coordinate_id", v.coordinateId);
  if (delError) return { ok: false, error: "使用作品の更新に失敗しました" };

  if (v.items.length > 0) {
    const { error: insError } = await supabase.from("coordinate_items").insert(
      v.items.map((item, idx) => ({
        coordinate_id: v.coordinateId,
        product_id: item.productId,
        pin_x: item.pinX ?? null,
        pin_y: item.pinY ?? null,
        note: item.note || null,
        sort_order: idx,
      }))
    );
    if (insError) return { ok: false, error: "使用作品の更新に失敗しました（重複していないか確認してください）" };
  }

  revalidatePath(`/coordinates/${v.coordinateId}`);
  revalidatePath(`/mypage/coordinates/${v.coordinateId}/edit`);
  return { ok: true, data: undefined };
}

export async function toggleCoordinateLike(
  coordinateId: string
): Promise<ActionResult<{ liked: boolean }>> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("coordinate_likes")
    .select("user_id")
    .eq("coordinate_id", coordinateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("coordinate_likes")
      .delete()
      .eq("coordinate_id", coordinateId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: "いいね解除に失敗しました" };
    revalidatePath(`/coordinates/${coordinateId}`);
    return { ok: true, data: { liked: false } };
  }

  const { error } = await supabase
    .from("coordinate_likes")
    .insert({ coordinate_id: coordinateId, user_id: user.id });
  if (error) return { ok: false, error: "いいねに失敗しました" };
  revalidatePath(`/coordinates/${coordinateId}`);
  return { ok: true, data: { liked: true } };
}

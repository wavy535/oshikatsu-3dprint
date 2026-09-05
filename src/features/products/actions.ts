"use server";

import { revalidatePath } from "next/cache";
import { requireCreator, requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import { validateStlAsset } from "./asset-validation";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "./schema";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function createProduct(
  input: CreateProductInput
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireCreator();

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase.rpc("create_product_with_relations", {
    p_creator_id: user.id,
    p_payload: parsed.data,
  });
  if (error || !data?.[0]) {
    return { ok: false, error: "作品の作成に失敗しました" };
  }

  revalidatePath("/studio/products");
  return { ok: true, data: { id: data[0].id } };
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput
): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase.rpc("update_product_with_relations", {
    p_product_id: id,
    p_creator_id: user.id,
    p_payload: parsed.data,
  });
  if (error) {
    return { ok: false, error: "作品の更新に失敗しました" };
  }

  revalidatePath("/studio/products");
  revalidatePath(`/studio/products/${id}/edit`);
  return { ok: true, data: undefined };
}

export async function uploadProductAsset(
  productId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireCreator();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルを選択してください" };
  }

  const validated = await validateStlAsset(file);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const partLabel = (formData.get("partLabel") as string | null) || null;
  const quantityPerItem = Number(formData.get("quantityPerItem") ?? 1) || 1;

  const path = `${user.id}/${productId}/${crypto.randomUUID()}.${validated.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("product-assets")
    .upload(path, file, { contentType: "application/octet-stream", upsert: false });
  if (uploadError) {
    return { ok: false, error: "アップロードに失敗しました（作品の所有者を確認してください）" };
  }

  const { data, error } = await supabase
    .from("product_assets")
    .insert({
      product_id: productId,
      storage_path: path,
      original_name: file.name,
      file_ext: validated.ext,
      file_size: file.size,
      part_label: partLabel,
      quantity_per_item: quantityPerItem,
    })
    .select("id")
    .single();

  if (error || !data) {
    await supabase.storage.from("product-assets").remove([path]);
    return { ok: false, error: "STL情報の保存に失敗しました" };
  }

  revalidatePath(`/studio/products/${productId}/edit`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteProductAsset(assetId: string): Promise<ActionResult> {
  const { supabase } = await requireCreator();

  const { data: asset } = await supabase
    .from("product_assets")
    .select("id, product_id, storage_path, products(sold_count)")
    .eq("id", assetId)
    .single();

  if (!asset) {
    return { ok: false, error: "STLが見つかりません" };
  }
  if ((asset.products?.sold_count ?? 0) > 0) {
    return { ok: false, error: "販売実績のある作品のSTLは削除できません" };
  }

  const { error } = await supabase.from("product_assets").delete().eq("id", assetId);
  if (error) {
    return { ok: false, error: "削除に失敗しました" };
  }
  await supabase.storage.from("product-assets").remove([asset.storage_path]);

  revalidatePath(`/studio/products/${asset.product_id}/edit`);
  return { ok: true, data: undefined };
}

export async function uploadProductImage(
  productId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireCreator();

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
  const path = `${user.id}/${productId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, error: "アップロードに失敗しました（作品の所有者を確認してください）" };
  }

  const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);

  const { data, error } = await supabase
    .from("product_images")
    .insert({ product_id: productId, image_url: pub.publicUrl })
    .select("id")
    .single();

  if (error || !data) {
    await supabase.storage.from("product-images").remove([path]);
    return { ok: false, error: "画像情報の保存に失敗しました" };
  }

  revalidatePath(`/studio/products/${productId}/edit`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteProductImage(imageId: string): Promise<ActionResult> {
  const { supabase } = await requireCreator();

  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id, image_url")
    .eq("id", imageId)
    .single();
  if (!image) {
    return { ok: false, error: "画像が見つかりません" };
  }

  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) {
    return { ok: false, error: "削除に失敗しました" };
  }

  // image_url はバケット直下からの公開URLなので、パス部分だけ抽出して削除する
  const path = image.image_url.split("/product-images/").pop();
  if (path) {
    await supabase.storage.from("product-images").remove([path]);
  }

  revalidatePath(`/studio/products/${image.product_id}/edit`);
  return { ok: true, data: undefined };
}

export async function submitForReview(productId: string): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const [{ count: assetCount }, { count: imageCount }] = await Promise.all([
    supabase
      .from("product_assets")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);

  if (!assetCount) {
    return { ok: false, error: "STLファイルを1件以上アップロードしてください" };
  }
  if (!imageCount) {
    return { ok: false, error: "商品画像を1件以上アップロードしてください" };
  }

  const { error } = await supabase
    .from("products")
    .update({ status: "in_review" })
    .eq("id", productId)
    .eq("creator_id", user.id);
  if (error) {
    return { ok: false, error: "審査申請に失敗しました" };
  }

  revalidatePath("/studio/products");
  revalidatePath(`/studio/products/${productId}/edit`);
  return { ok: true, data: undefined };
}

export async function archiveProduct(productId: string): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const { error } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", productId)
    .eq("creator_id", user.id);
  if (error) {
    return { ok: false, error: "販売停止に失敗しました" };
  }

  revalidatePath("/studio/products");
  return { ok: true, data: undefined };
}

export async function toggleFavorite(
  productId: string,
  productSlug: string
): Promise<ActionResult<{ favorited: boolean }>> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", productId);
    if (error) return { ok: false, error: "お気に入り解除に失敗しました" };
    revalidatePath(`/products/${productSlug}`);
    return { ok: true, data: { favorited: false } };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, product_id: productId });
  if (error) return { ok: false, error: "お気に入り登録に失敗しました" };
  revalidatePath(`/products/${productSlug}`);
  return { ok: true, data: { favorited: true } };
}

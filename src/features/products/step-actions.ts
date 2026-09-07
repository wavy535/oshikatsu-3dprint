"use server";

import { revalidatePath } from "next/cache";
import { requireCreator } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import { validateStlAsset } from "./asset-validation";
import {
  analyzeMesh,
  estimateAgencyFee,
  estimatePrintMinutes,
  estimateWeightG,
  BUILD_VOLUME_MM,
  type MeshAnalysis,
} from "./mesh-validation";
import {
  printInstructionsSchema,
  productInfoSchema,
  type PrintInstructionsInput,
  type ProductInfoInput,
} from "./schema";

function newSlug() {
  return `w-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * STEP1: 3Dデータをアップロードして自動検証する。
 * 下書きがまだ無ければここで作る（Figma の STEP1 は「まずデータを上げる」導線のため）。
 */
export async function uploadAndValidateAsset(
  formData: FormData
): Promise<ActionResult<{ productId: string; assetId: string; analysis: MeshAnalysis }>> {
  const { supabase, user } = await requireCreator();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ファイルを選択してください" };
  }

  const validated = await validateStlAsset(file);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  let productId = (formData.get("productId") as string | null) || null;
  if (!productId) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!category) {
      return { ok: false, error: "カテゴリマスタが未設定です" };
    }

    const { data: draft, error: draftError } = await supabase
      .from("products")
      .insert({
        creator_id: user.id,
        slug: newSlug(),
        title: "無題の作品",
        description: "",
        category_id: category.id,
        base_price: 1000,
        status: "draft",
      })
      .select("id")
      .single();
    if (draftError || !draft) {
      return { ok: false, error: "下書きの作成に失敗しました" };
    }
    productId = draft.id;
  }

  const analysis = await analyzeMesh(file, validated.ext);

  const path = `${user.id}/${productId}/${crypto.randomUUID()}.${validated.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("product-assets")
    .upload(path, file, { contentType: "application/octet-stream", upsert: false });
  if (uploadError) {
    return { ok: false, error: "アップロードに失敗しました" };
  }

  const { data: asset, error: assetError } = await supabase
    .from("product_assets")
    .insert({
      product_id: productId,
      storage_path: path,
      original_name: file.name,
      file_ext: validated.ext,
      file_size: file.size,
      part_label: (formData.get("partLabel") as string | null) || null,
      quantity_per_item: Number(formData.get("quantityPerItem") ?? 1) || 1,
    })
    .select("id")
    .single();
  if (assetError || !asset) {
    await supabase.storage.from("product-assets").remove([path]);
    return { ok: false, error: "3Dデータの保存に失敗しました" };
  }

  await supabase.from("product_asset_validations").upsert({
    asset_id: asset.id,
    product_id: productId,
    passed: analysis.passed,
    checks: analysis.checks,
    triangle_count: analysis.triangleCount,
    bbox_w_mm: analysis.bbox?.w ?? null,
    bbox_d_mm: analysis.bbox?.d ?? null,
    bbox_h_mm: analysis.bbox?.h ?? null,
    shell_count: analysis.shellCount,
  });

  if (analysis.bbox) {
    await supabase
      .from("products")
      .update({
        size_w_mm: Math.max(1, Math.round(analysis.bbox.w)),
        size_d_mm: Math.max(1, Math.round(analysis.bbox.d)),
        size_h_mm: Math.max(1, Math.round(analysis.bbox.h)),
      })
      .eq("id", productId);
  }

  // 検証を通ったらサイズ展開と代行費を自動で用意する（Figma STEP1 右カラム）
  if (analysis.passed && analysis.volumeCm3) {
    await seedSizeVariants(supabase, productId, analysis);
  }

  revalidatePath(`/studio/products/${productId}/steps/1`);
  return { ok: true, data: { productId, assetId: asset.id, analysis } };
}

/**
 * サイズ展開の初期値を作る。ぬいサイズの高さ比を倍率として、
 * 代行費・造形時間・重量を自動算出する。造形上限を超えるサイズは
 * is_active=false（Figma の「取扱なし / サイズ上限超過」）にする。
 */
async function seedSizeVariants(
  supabase: Awaited<ReturnType<typeof requireCreator>>["supabase"],
  productId: string,
  analysis: MeshAnalysis
) {
  const { data: sizes } = await supabase
    .from("nui_sizes")
    .select("id, label, height_mm")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (!sizes?.length || !analysis.bbox || !analysis.volumeCm3) return;

  // 「その他・フリーサイズ」は height_mm = 0 なので基準から外す。
  // これを混ぜると baseHeight が 0 になり、倍率が Infinity になって行が壊れる。
  const heights = sizes.map((s) => s.height_mm).filter((h) => h > 0);
  const baseHeight = heights.length > 0 ? Math.min(...heights) : 1;

  const rows = sizes.map((s) => {
    const scale = s.height_mm > 0 ? s.height_mm / baseHeight : 1;
    const fits =
      analysis.bbox!.w * scale <= BUILD_VOLUME_MM.w &&
      analysis.bbox!.d * scale <= BUILD_VOLUME_MM.d &&
      analysis.bbox!.h * scale <= BUILD_VOLUME_MM.h;
    const fee = estimateAgencyFee(analysis.volumeCm3!, scale);
    return {
      product_id: productId,
      nui_size_id: s.id,
      // 既定価格は「代行費 + 目安の作家取り分」。STEP3 で本人が上書きする
      price: Math.max(100, Math.round((fee * 2) / 100) * 100),
      stock: 0,
      agency_fee: fee,
      est_weight_g: estimateWeightG(analysis.volumeCm3!, scale),
      est_print_min: estimatePrintMinutes(analysis.volumeCm3!, scale),
      is_active: fits,
      unavailable_reason: fits ? null : "サイズ上限超過",
    };
  });

  const { error } = await supabase.from("product_size_variants").upsert(rows, {
    onConflict: "product_id,nui_size_id",
    ignoreDuplicates: true,
  });
  if (error) {
    // 失敗しても STEP1 のアップロード自体は成功させるが、黙って消さない
    console.error("サイズ展開の自動作成に失敗しました", error);
  }
}

/** STEP2: パーツごとの印刷指示（積層方向・サポート・色スロット）を保存する */
export async function savePrintInstructions(
  input: PrintInstructionsInput
): Promise<ActionResult> {
  const { supabase } = await requireCreator();

  const parsed = printInstructionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  for (const part of parsed.data.parts) {
    // RLS で弾かれると error にならず 0 行更新になるので、更新行を返させて確認する
    const { data, error } = await supabase
      .from("product_assets")
      .update({
        part_label: part.partLabel || null,
        quantity_per_item: part.quantityPerItem,
        layer_direction: part.layerDirection,
        support_type: part.supportType,
        color_slot: part.colorSlot ?? null,
        filament_id: part.filamentId ?? null,
        print_note: part.printNote || null,
      })
      .eq("id", part.assetId)
      .eq("product_id", parsed.data.productId)
      .select("id");
    if (error || !data?.length) {
      return { ok: false, error: "印刷指示の保存に失敗しました" };
    }
  }

  revalidatePath(`/studio/products/${parsed.data.productId}/steps/2`);
  return { ok: true, data: undefined };
}

/** STEP3: 作品情報とサイズごとの価格・在庫を保存する */
export async function saveProductInfo(input: ProductInfoInput): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const parsed = productInfoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error: productError } = await supabase
    .from("products")
    .update({
      title: v.title,
      description: v.description,
      category_id: v.categoryId,
      print_note: v.printNote || null,
    })
    .eq("id", v.productId)
    .eq("creator_id", user.id);
  if (productError) {
    return { ok: false, error: "作品情報の保存に失敗しました" };
  }

  // タグは総入れ替え
  await supabase.from("product_tags").delete().eq("product_id", v.productId);
  if (v.tagIds.length > 0) {
    await supabase
      .from("product_tags")
      .insert(v.tagIds.map((id) => ({ product_id: v.productId, tag_id: id })));
  }

  // 選べる色
  await supabase.from("product_filaments").delete().eq("product_id", v.productId);
  if (v.filamentIds.length > 0) {
    await supabase.from("product_filaments").insert(
      v.filamentIds.map((id) => ({
        product_id: v.productId,
        filament_id: id,
        is_default: id === v.defaultFilamentId,
      }))
    );
  }

  for (const variant of v.variants) {
    const { error } = await supabase
      .from("product_size_variants")
      .update({
        price: variant.price,
        stock: variant.stock,
        is_active: variant.isActive,
      })
      .eq("product_id", v.productId)
      .eq("nui_size_id", variant.nuiSizeId);
    if (error) {
      return { ok: false, error: "サイズ展開の保存に失敗しました" };
    }
  }

  revalidatePath(`/studio/products/${v.productId}/steps/3`);
  return { ok: true, data: undefined };
}

/** STEP4: サムネイルを決めて審査に出す */
export async function publishProduct(
  productId: string,
  thumbnailImageId: string | null
): Promise<ActionResult> {
  const { supabase, user } = await requireCreator();

  const { data: product } = await supabase
    .from("products")
    .select("id, title, status, product_size_variants(is_active, stock, price)")
    .eq("id", productId)
    .eq("creator_id", user.id)
    .single();
  if (!product) {
    return { ok: false, error: "作品が見つかりません" };
  }
  if (product.title === "無題の作品") {
    return { ok: false, error: "STEP3 で作品名を入力してください" };
  }
  const sellable = product.product_size_variants.filter((v) => v.is_active && v.stock > 0);
  if (sellable.length === 0) {
    return { ok: false, error: "在庫のあるサイズが1つも設定されていません" };
  }

  const { data: images } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId);
  if (!images?.length) {
    return { ok: false, error: "画像を1枚以上アップロードしてください" };
  }

  // サムネイルは sort_order = 0 の画像。選ばれたものを先頭に持ってくる
  if (thumbnailImageId) {
    await supabase
      .from("product_images")
      .update({ sort_order: 10 })
      .eq("product_id", productId)
      .neq("id", thumbnailImageId);
    await supabase
      .from("product_images")
      .update({ sort_order: 0 })
      .eq("id", thumbnailImageId);
  }

  if (product.status === "draft" || product.status === "rejected") {
    const { error } = await supabase
      .from("products")
      .update({ status: "in_review" })
      .eq("id", productId);
    if (error) {
      return { ok: false, error: "審査申請に失敗しました" };
    }
  }

  revalidatePath("/studio/products");
  return { ok: true, data: undefined };
}

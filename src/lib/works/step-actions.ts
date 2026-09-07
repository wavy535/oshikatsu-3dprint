"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { validateAndPersistAsset } from "@/lib/works/asset-validation";

export type StepActionState = { error: string | null; ok?: boolean };

type OwnWork =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string }; work: { id: string; status: string } }
  | { ok: false; error: string };

/** その作品の持ち主か確かめる。すべてのSTEPの入口で通す。 */
async function requireOwnWork(workId: string): Promise<OwnWork> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です" };

  const { data: work } = await supabase
    .from("works")
    .select("id, creator_id, status")
    .eq("id", workId)
    .maybeSingle();

  if (!work || work.creator_id !== user.id) {
    return { ok: false, error: "この作品を編集する権限がありません" };
  }
  return { ok: true, supabase, user, work };
}

/** 「作品を投稿する」から呼ぶ。空の下書きを作って STEP1 へ送る。 */
export async function createDraftWorkAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/studio/works");

  const { data, error } = await supabase
    .from("works")
    .insert({ creator_id: user.id, title: "無題の作品", status: "draft" })
    .select("id")
    .single();

  if (error || !data) redirect("/studio/works?error=create");
  redirect(`/studio/works/${data.id}/steps/1`);
}

// ───────── STEP1: 3Dデータ ─────────

const assetSchema = z.object({
  workId: z.uuid(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(200),
  fileSize: z.coerce.number().int().positive(),
});

/**
 * アップロード済みのファイルを work_assets として登録し、そのまま検証まで走らせる。
 *
 * ファイル本体はブラウザから Storage へ直接上げる（Server Action の本文サイズ制限に
 * 3Dデータは収まらないため）。パスは storage のポリシーと同じ
 * `{creator_id}/{work_id}/{ファイル名}` で、他人のフォルダには書けない。
 */
export async function registerAssetAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const parsed = assetSchema.safeParse({
    workId: formData.get("workId"),
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
    fileSize: formData.get("fileSize"),
  });
  if (!parsed.success) return { error: "アップロードの情報が不正です" };

  const owned = await requireOwnWork(parsed.data.workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase, user } = owned;

  const ext = parsed.data.fileName.split(".").pop()?.toLowerCase();
  if (ext !== "stl" && ext !== "3mf") {
    return { error: "STL または 3MF のファイルを選んでください" };
  }
  if (!parsed.data.storagePath.startsWith(`${user.id}/${parsed.data.workId}/`)) {
    return { error: "アップロード先が不正です" };
  }

  // 1作品1データ（差し替え）。古い行は解析結果ごと消える
  await supabase.from("work_assets").delete().eq("work_id", parsed.data.workId);

  const { data: asset, error } = await supabase
    .from("work_assets")
    .insert({
      work_id: parsed.data.workId,
      storage_path: parsed.data.storagePath,
      file_name: parsed.data.fileName,
      file_format: ext,
      file_size_bytes: parsed.data.fileSize,
      is_primary: true,
    })
    .select("id")
    .single();

  if (error || !asset) return { error: "3Dデータを登録できませんでした" };

  const result = await validateAndPersistAsset(asset.id);
  revalidatePath(`/studio/works/${parsed.data.workId}/steps/1`);

  if (!result.ok) return { error: result.error };
  return { error: null, ok: true };
}

/** 検証をやり直す（アップロードし直さずに再解析する）。 */
export async function revalidateAssetAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const result = await validateAndPersistAsset(assetId);
  revalidatePath(`/studio/works/${workId}/steps/1`);
  return result.ok ? { error: null, ok: true } : { error: result.error };
}

// ───────── STEP2: 印刷指示 ─────────

const instructionsSchema = z.object({
  workId: z.uuid(),
  instructions: z.array(
    z.object({
      id: z.uuid(),
      orientation: z.enum(["flat", "upright", "tilted", "as_is"]),
      support: z.enum(["none", "auto", "custom"]),
      noRotate: z.boolean(),
      note: z.string().max(500).nullable(),
    })
  ),
  slots: z.array(z.object({ id: z.uuid(), filamentId: z.uuid().nullable() })),
});

/**
 * パーツごとの置き方・サポートと、色スロットへのフィラメント割り当てを保存する。
 * 印刷指示は work_part_instructions の行更新なので、RLS で弾かれていないかを
 * 更新行数で確かめる（0行更新でも例外は出ない）。
 */
export async function savePrintInstructionsAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const raw = formData.get("payload");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(raw ?? ""));
  } catch {
    return { error: "入力を読み取れませんでした" };
  }

  const parsed = instructionsSchema.safeParse(parsedJson);
  if (!parsed.success) return { error: "印刷指示の内容を確認してください" };

  const owned = await requireOwnWork(parsed.data.workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase } = owned;

  for (const ins of parsed.data.instructions) {
    const { data, error } = await supabase
      .from("work_part_instructions")
      .update({
        orientation: ins.orientation,
        support: ins.support,
        no_rotate: ins.noRotate,
        note: ins.note,
      })
      .eq("id", ins.id)
      .select("id");
    if (error || !data || data.length === 0) {
      return { error: "印刷指示を保存できませんでした" };
    }
  }

  for (const slot of parsed.data.slots) {
    const { data, error } = await supabase
      .from("work_color_slots")
      .update({ filament_id: slot.filamentId })
      .eq("id", slot.id)
      .select("id");
    if (error || !data || data.length === 0) {
      return { error: "色の割り当てを保存できませんでした" };
    }
  }

  revalidatePath(`/studio/works/${parsed.data.workId}/steps/2`);
  redirect(`/studio/works/${parsed.data.workId}/steps/3`);
}

// ───────── STEP3: 作品情報とサイズ展開 ─────────

const infoSchema = z.object({
  workId: z.uuid(),
  title: z.string().min(1, "作品名を入力してください").max(80),
  description: z.string().max(5000),
  tagIds: z.array(z.uuid()).max(10),
  accepts: z.object({
    colorChange: z.boolean(),
    mirror: z.boolean(),
    standHole: z.boolean(),
    customSize: z.boolean(),
    otherRequest: z.boolean(),
  }),
  /** 原寸の内寸（mm）。他サイズは scale_fit_dims トリガーが埋める */
  fit: z.object({
    widthMm: z.number().positive().max(1000).nullable(),
    heightMm: z.number().positive().max(1000).nullable(),
    depthMm: z.number().positive().max(1000).nullable(),
  }),
  variants: z.array(
    z.object({
      id: z.uuid(),
      priceJpy: z.number().int().min(0).max(500000).nullable(),
      stock: z.number().int().min(0).max(9999).nullable(),
      isListed: z.boolean(),
    })
  ),
});

export async function saveWorkInfoAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "入力を読み取れませんでした" };
  }

  const parsed = infoSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const owned = await requireOwnWork(parsed.data.workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase } = owned;

  const { data: updated, error } = await supabase
    .from("works")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      accepts_color_change: parsed.data.accepts.colorChange,
      accepts_mirror: parsed.data.accepts.mirror,
      accepts_stand_hole: parsed.data.accepts.standHole,
      accepts_custom_size: parsed.data.accepts.customSize,
      accepts_other_request: parsed.data.accepts.otherRequest,
    })
    .eq("id", parsed.data.workId)
    .select("id");

  if (error || !updated || updated.length === 0) return { error: "作品情報を保存できませんでした" };

  // タグは付け替え
  await supabase.from("work_tags").delete().eq("work_id", parsed.data.workId);
  if (parsed.data.tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("work_tags")
      .insert(parsed.data.tagIds.map((tag_id) => ({ work_id: parsed.data.workId, tag_id })));
    if (tagError) return { error: "タグを保存できませんでした" };
  }

  // 内寸は原寸だけ入力する。他サイズは scale_ratio からトリガーが埋める（設計判断6）
  const base = parsed.data.variants.length
    ? await supabase
        .from("work_variants")
        .select("id")
        .eq("work_id", parsed.data.workId)
        .eq("is_base", true)
        .maybeSingle()
    : { data: null };

  if (base.data) {
    const { error: fitError } = await supabase
      .from("work_variants")
      .update({
        fit_width_mm: parsed.data.fit.widthMm,
        fit_height_mm: parsed.data.fit.heightMm,
        fit_depth_mm: parsed.data.fit.depthMm,
      })
      .eq("id", base.data.id)
      .select("id");
    if (fitError) return { error: "内寸を保存できませんでした" };

    // 他サイズの内寸は scale_fit_dims が計算する。ただしトリガーは
    // 「自分が値を持っていたら触らない」ので、原寸を変えたときに追随させるには
    // 一度 null に戻して scale_ratio を書き直す必要がある（式はDB側に置いたまま）
    const { error: rescaleError } = await supabase
      .from("work_variants")
      .update({ fit_width_mm: null, fit_height_mm: null, fit_depth_mm: null })
      .eq("work_id", parsed.data.workId)
      .eq("is_base", false);
    if (rescaleError) return { error: "内寸を反映できませんでした" };

    const { data: others } = await supabase
      .from("work_variants")
      .select("id, scale_ratio")
      .eq("work_id", parsed.data.workId)
      .eq("is_base", false);

    for (const o of others ?? []) {
      await supabase
        .from("work_variants")
        .update({ scale_ratio: o.scale_ratio })
        .eq("id", o.id);
    }
  }

  for (const v of parsed.data.variants) {
    const { data, error: variantError } = await supabase
      .from("work_variants")
      .update({ price_jpy: v.priceJpy, stock: v.stock, is_listed: v.isListed })
      .eq("id", v.id)
      .select("id");
    if (variantError) {
      // 価格の下限は sync_work_variant が例外で止める。文言をそのまま出す
      return { error: variantError.message };
    }
    if (!data || data.length === 0) return { error: "サイズ展開を保存できませんでした" };
  }

  revalidatePath(`/studio/works/${parsed.data.workId}/steps/3`);
  redirect(`/studio/works/${parsed.data.workId}/steps/4`);
}

// ───────── STEP4: 画像と公開 ─────────

export async function registerImageAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const storagePath = String(formData.get("storagePath") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase, user } = owned;

  if (!storagePath.startsWith(`${user.id}/${workId}/`)) {
    return { error: "アップロード先が不正です" };
  }

  const { count } = await supabase
    .from("work_images")
    .select("id", { count: "exact", head: true })
    .eq("work_id", workId);

  const { data, error } = await supabase
    .from("work_images")
    .insert({ work_id: workId, storage_path: storagePath, sort_order: count ?? 0 })
    .select("id");

  if (error || !data || data.length === 0) return { error: "画像を登録できませんでした" };
  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

/** サムネイル（先頭の画像）を決める。並び順を入れ替えるだけ。 */
export async function setThumbnailAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase } = owned;

  const { data: images } = await supabase
    .from("work_images")
    .select("id")
    .eq("work_id", workId)
    .order("sort_order", { ascending: true });

  const rest = (images ?? []).filter((i) => i.id !== imageId);
  const ordered = [imageId, ...rest.map((i) => i.id)];

  for (const [index, id] of ordered.entries()) {
    const { data, error } = await supabase
      .from("work_images")
      .update({ sort_order: index })
      .eq("id", id)
      .select("id");
    if (error || !data || data.length === 0) return { error: "並び替えできませんでした" };
  }

  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

export async function deleteImageAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const { data, error } = await owned.supabase
    .from("work_images")
    .delete()
    .eq("id", imageId)
    .select("id");

  if (error || !data || data.length === 0) return { error: "削除できませんでした" };
  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

/**
 * 公開する。出品できるサイズが1つも無い、画像が無い、検証が failed のままの
 * ときは止める（公開してから買えないことに気づく、という事故を防ぐ）。
 */
export async function publishWorkAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { supabase } = owned;

  const [assetsRes, variantsRes, imagesRes, workRes] = await Promise.all([
    supabase.from("work_assets").select("validation_status").eq("work_id", workId),
    supabase.from("work_variants").select("id, is_listed, price_jpy").eq("work_id", workId),
    supabase.from("work_images").select("id").eq("work_id", workId),
    supabase.from("works").select("title").eq("id", workId).maybeSingle(),
  ]);

  if ((assetsRes.data ?? []).length === 0) return { error: "3Dデータをアップロードしてください" };
  if ((assetsRes.data ?? []).some((a) => a.validation_status === "failed")) {
    return { error: "検証に通っていない3Dデータがあります" };
  }
  if (!(variantsRes.data ?? []).some((v) => v.is_listed && v.price_jpy !== null)) {
    return { error: "出品するサイズと価格を1つ以上設定してください" };
  }
  if ((imagesRes.data ?? []).length === 0) return { error: "画像を1枚以上登録してください" };
  if (!workRes.data?.title || workRes.data.title === "無題の作品") {
    return { error: "作品名を入力してください" };
  }

  const { data, error } = await supabase
    .from("works")
    .update({ status: "published" })
    .eq("id", workId)
    .select("id");

  if (error || !data || data.length === 0) return { error: "公開できませんでした" };

  revalidatePath("/studio/works");
  revalidatePath("/works");
  redirect(`/works/${workId}`);
}

/** 公開を止めて下書きに戻す。 */
export async function unpublishWorkAction(
  _prev: StepActionState,
  formData: FormData
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const { data, error } = await owned.supabase
    .from("works")
    .update({ status: "draft" })
    .eq("id", workId)
    .select("id");

  if (error || !data || data.length === 0) return { error: "変更できませんでした" };
  revalidatePath("/studio/works");
  revalidatePath("/works");
  return { error: null, ok: true };
}

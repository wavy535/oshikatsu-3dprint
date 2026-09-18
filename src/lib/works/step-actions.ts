"use server";
import { sql } from "kysely";
import { checkStoredFile } from "@/lib/files/s3";
import { queryResult, countResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";
import { validateAndPersistAsset } from "@/lib/works/asset-validation";
import { requireOwnWork } from "./ownership";
import { idSchema } from "@/lib/validation";

export type StepActionState = { error: string | null; ok?: boolean };

/** 「作品を投稿する」から呼ぶ。空の下書きを作って STEP1 へ送る。 */
export async function createDraftWorkAction(): Promise<void> {
  const { db, user } = await getOptionalUser();
  if (!user) redirect("/login?redirect=/studio/works");

  const { data, error } = await queryResult(
    db
      .insertInto("works")
      .values({ creator_id: user.id, title: "無題の作品", status: "draft" })
      .returning(["id"])
      .executeTakeFirstOrThrow(),
  );

  if (error || !data) redirect("/studio/works?error=create");
  redirect(`/studio/works/${data.id}/steps/1`);
}

// ───────── STEP1: 3Dデータ ─────────

/** 検証をやり直す（アップロードし直さずに再解析する）。 */
export async function revalidateAssetAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const parsed = z.object({ workId: idSchema, assetId: idSchema }).safeParse({
    workId: formData.get("workId"),
    assetId: formData.get("assetId"),
  });
  if (!parsed.success) return { error: "3Dデータの指定が不正です" };
  const { workId, assetId } = parsed.data;
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const { data: asset, error } = await queryResult(
    owned.db
      .selectFrom("work_assets")
      .select(["work_assets.id"])
      .where("work_assets.id", "=", assetId)
      .where("work_assets.work_id", "=", workId)
      .executeTakeFirst(),
  );
  if (error || !asset) return { error: "この作品の3Dデータが見つかりません" };

  const result = await validateAndPersistAsset(asset.id, workId);
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
    }),
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
  formData: FormData,
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
  const { db } = owned;

  const { error } = await queryResult(
    db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("works")
        .select("id")
        .where("id", "=", parsed.data.workId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      for (const ins of parsed.data.instructions) {
        await tx
          .updateTable("work_part_instructions")
          .set({
            orientation: ins.orientation,
            support: ins.support,
            no_rotate: ins.noRotate,
            note: ins.note,
          })
          .where("id", "=", ins.id)
          .where("work_id", "=", parsed.data.workId)
          .returning("id")
          .executeTakeFirstOrThrow();
      }
      for (const slot of parsed.data.slots) {
        await tx
          .updateTable("work_color_slots")
          .set({ filament_id: slot.filamentId })
          .where("id", "=", slot.id)
          .where("work_id", "=", parsed.data.workId)
          .returning("id")
          .executeTakeFirstOrThrow();
      }
    }),
  );
  if (error) return { error: "印刷指示と色の割り当てを保存できませんでした" };

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
  /** 原寸の内寸（mm）。保存時に他サイズの自動寸法へ一括反映する */
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
    }),
  ),
});

export async function saveWorkInfoAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "入力を読み取れませんでした" };
  }

  const parsed = infoSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const owned = await requireOwnWork(parsed.data.workId);
  if (!owned.ok) return { error: owned.error };
  const { db } = owned;

  const v = parsed.data;
  const { error } = await queryResult(
    db.transaction().execute(async (tx) => {
      // Updating the parent first serializes saves and model-analysis writes for this work.
      await tx
        .updateTable("works")
        .set({
          title: v.title,
          description: v.description,
          accepts_color_change: v.accepts.colorChange,
          accepts_mirror: v.accepts.mirror,
          accepts_stand_hole: v.accepts.standHole,
          accepts_custom_size: v.accepts.customSize,
          accepts_other_request: v.accepts.otherRequest,
        })
        .where("id", "=", v.workId)
        .returning("id")
        .executeTakeFirstOrThrow();

      await tx
        .deleteFrom("work_tags")
        .where("work_id", "=", v.workId)
        .execute();
      if (v.tagIds.length) {
        await tx
          .insertInto("work_tags")
          .values(
            [...new Set(v.tagIds)].map((tag_id) => ({
              work_id: v.workId,
              tag_id,
            })),
          )
          .execute();
      }

      await tx
        .updateTable("work_variants")
        .set({
          fit_width_mm: v.fit.widthMm,
          fit_height_mm: v.fit.heightMm,
          fit_depth_mm: v.fit.depthMm,
          fit_source: "creator",
        })
        .where("work_id", "=", v.workId)
        .where("is_base", "=", true)
        .execute();
      // Recalculate derived dimensions in one statement; preserve explicitly entered dimensions.
      // No dummy scale_ratio updates or per-variant reads are needed.
      await tx
        .updateTable("work_variants")
        .set({
          fit_width_mm: sql`round(${v.fit.widthMm}::numeric * scale_ratio, 2)`,
          fit_height_mm: sql`round(${v.fit.heightMm}::numeric * scale_ratio, 2)`,
          fit_depth_mm: sql`round(${v.fit.depthMm}::numeric * scale_ratio, 2)`,
          fit_source: "auto",
        })
        .where("work_id", "=", v.workId)
        .where("is_base", "=", false)
        .where((eb) =>
          eb.or([
            eb("fit_source", "=", "auto"),
            eb("fit_width_mm", "is", null),
          ]),
        )
        .execute();

      for (const variant of v.variants) {
        const saved = await tx
          .updateTable("work_variants")
          .set({
            price_jpy: variant.priceJpy,
            stock: variant.stock,
            is_listed: variant.isListed,
          })
          .where("id", "=", variant.id)
          .where("work_id", "=", v.workId)
          .returning("id")
          .executeTakeFirst();
        if (!saved)
          throw new Error("この作品に含まれないサイズが指定されています");
      }
    }),
  );
  if (error)
    return { error: `作品情報を保存できませんでした（${error.message}）` };

  revalidatePath(`/studio/works/${parsed.data.workId}/steps/3`);
  redirect(`/studio/works/${parsed.data.workId}/steps/4`);
}

// ───────── STEP4: 画像と公開 ─────────

export async function registerImageAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const storagePath = String(formData.get("storagePath") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { db, user } = owned;

  if (!storagePath.startsWith(`${user.id}/${workId}/`)) {
    return { error: "アップロード先が不正です" };
  }

  const stored = await queryResult(
    checkStoredFile("work-images", storagePath, 10 * 1024 * 1024),
  );
  if (stored.error)
    return { error: "アップロード済み画像を確認できませんでした" };

  const { count } = await countResult(
    db
      .selectFrom("work_images")
      .where("work_images.work_id", "=", workId)
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow(),
  );

  const { data, error } = await queryResult(
    db
      .insertInto("work_images")
      .values({
        work_id: workId,
        storage_path: storagePath,
        sort_order: count ?? 0,
      })
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "画像を登録できませんでした" };
  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

/** サムネイル（先頭の画像）を決める。並び順を入れ替えるだけ。 */
export async function setThumbnailAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { db } = owned;

  const { data: images } = await queryResult(
    db
      .selectFrom("work_images")
      .select(["work_images.id"])
      .where("work_images.work_id", "=", workId)
      .orderBy("work_images.sort_order", "asc")
      .execute(),
  );

  const rest = (images ?? []).filter((i) => i.id !== imageId);
  const ordered = [imageId, ...rest.map((i) => i.id)];

  for (const [index, id] of ordered.entries()) {
    const { data, error } = await queryResult(
      db
        .updateTable("work_images")
        .set({ sort_order: index })
        .where("work_images.id", "=", id)
        .returning(["id"])
        .execute(),
    );
    if (error || !data || data.length === 0)
      return { error: "並び替えできませんでした" };
  }

  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

export async function deleteImageAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const { data, error } = await queryResult(
    owned.db
      .deleteFrom("work_images")
      .where("work_images.id", "=", imageId)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "削除できませんでした" };
  revalidatePath(`/studio/works/${workId}/steps/4`);
  return { error: null, ok: true };
}

/**
 * 公開する。出品できるサイズが1つも無い、画像が無い、検証が failed のままの
 * ときは止める（公開してから買えないことに気づく、という事故を防ぐ）。
 */
export async function publishWorkAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  const { db } = owned;

  const [assetsRes, variantsRes, imagesRes, workRes] = await Promise.all([
    queryResult(
      db
        .selectFrom("work_assets")
        .select(["work_assets.validation_status"])
        .where("work_assets.work_id", "=", workId)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("work_variants")
        .select([
          "work_variants.id",
          "work_variants.is_listed",
          "work_variants.price_jpy",
        ])
        .where("work_variants.work_id", "=", workId)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("work_images")
        .select(["work_images.id"])
        .where("work_images.work_id", "=", workId)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("works")
        .select(["works.title"])
        .where("works.id", "=", workId)
        .executeTakeFirst(),
    ),
  ]);

  if ((assetsRes.data ?? []).length === 0)
    return { error: "3Dデータをアップロードしてください" };
  if ((assetsRes.data ?? []).some((a) => !["passed", "warning"].includes(a.validation_status))) {
    return { error: "検証に通っていない3Dデータがあります" };
  }
  if (
    !(variantsRes.data ?? []).some((v) => v.is_listed && v.price_jpy !== null)
  ) {
    return { error: "出品するサイズと価格を1つ以上設定してください" };
  }
  if ((imagesRes.data ?? []).length === 0)
    return { error: "画像を1枚以上登録してください" };
  if (!workRes.data?.title || workRes.data.title === "無題の作品") {
    return { error: "作品名を入力してください" };
  }

  const { data, error } = await queryResult(
    db
      .updateTable("works")
      .set({ status: "published" })
      .where("works.id", "=", workId)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "公開できませんでした" };

  revalidatePath("/studio/works");
  revalidatePath("/works");
  redirect(`/works/${workId}`);
}

/** 公開を止めて下書きに戻す。 */
export async function unpublishWorkAction(
  _prev: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const workId = String(formData.get("workId") ?? "");
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };

  const { data, error } = await queryResult(
    owned.db
      .updateTable("works")
      .set({ status: "draft" })
      .where("works.id", "=", workId)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "変更できませんでした" };
  revalidatePath("/studio/works");
  revalidatePath("/works");
  return { error: null, ok: true };
}

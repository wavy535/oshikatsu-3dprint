import { readModel } from "@/lib/files/s3";
import { queryResult } from "@/lib/db/result";
import "server-only";

import {
  analyzeModelFile,
  type AssetAnalysis,
  type PricingRule,
} from "@/lib/print";
import { serviceDatabase, type Db } from "@/lib/db/client";
import type {
  TablesInsert,
  Json,
  PrintOrientation,
  SupportMode,
} from "@/types/db";

// STEP1 のアップロード後に走る検証パイプライン。
//   S3から 3D データを落とす → 解析する → 結果をDBに書く
// までを1本にまとめている。再実行しても同じ結果になるよう、
// 解析由来の行は毎回作り直し、クリエイターが手で決めた値（色の割り当て・
// 価格・在庫・公開設定）は残す。

export type ValidateAssetResult =
  | { ok: true; analysis: AssetAnalysis; variantIds: string[] }
  | { ok: false; error: string; stage: string };

async function loadPricingRule(db: Db): Promise<PricingRule> {
  const data = await db
    .selectFrom("print_pricing_rules")
    .selectAll()
    .where("is_active", "=", true)
    .executeTakeFirstOrThrow();

  return {
    materialYenPerGram: Number(data.material_yen_per_gram),
    machineYenPerHour: Number(data.machine_yen_per_hour),
    handlingBaseYen: data.handling_base_yen,
    handlingPerPartYen: data.handling_per_part_yen,
    platformFeeRate: Number(data.platform_fee_rate),
    bedXMm: data.bed_x_mm,
    bedYMm: data.bed_y_mm,
    bedZMm: data.bed_z_mm,
    maxBatchHours: Number(data.max_batch_hours),
  };
}

// パーツの形から、運営が最初に見る既定の置き方を決める。
// 平たいものは寝かせる（層間剥離を避ける）、細長いものは立てて支持を付ける。
function defaultInstruction(bbox: [number, number, number]): {
  orientation: PrintOrientation;
  support: SupportMode;
  note: string | null;
} {
  const sorted = [...bbox].sort((a, b) => a - b);
  const [minD, midD, maxD] = sorted;
  const flatness = minD / Math.max(maxD, 1e-6);

  if (flatness < 0.2) {
    return {
      orientation: "flat",
      support: "none",
      note: "板状のパーツです。寝かせて印刷してください（立てると層間剥離で割れます）",
    };
  }
  if (maxD / Math.max(midD, 1e-6) > 1.8) {
    return {
      orientation: "upright",
      support: "auto",
      note: "縦長のパーツです。立てて印刷し、オーバーハングにサポートを付けてください",
    };
  }
  return { orientation: "as_is", support: "auto", note: null };
}

type AssetFile = {
  storage_path: string;
  file_name: string;
  file_size_bytes?: number;
};
type AnalysisResult =
  | { ok: true; analysis: AssetAnalysis; bytes: number }
  | Extract<ValidateAssetResult, { ok: false }>;

async function analyzeFile(db: Db, asset: AssetFile): Promise<AnalysisResult> {
  const { data: buffer, error: downloadError } = await queryResult(
    readModel(asset.storage_path),
  );
  if (
    downloadError ||
    !buffer ||
    (asset.file_size_bytes !== undefined &&
      buffer.byteLength !== asset.file_size_bytes)
  ) {
    return {
      ok: false,
      error: "3Dデータを読み込めないか、アップロード時のサイズと一致しません",
      stage: "download",
    };
  }
  const { data: rule, error: ruleError } = await queryResult(
    loadPricingRule(db),
  );
  if (ruleError || !rule)
    return {
      ok: false,
      error: "印刷料金の設定を取得できませんでした",
      stage: "pricing",
    };
  try {
    return {
      ok: true,
      analysis: analyzeModelFile(buffer, { fileName: asset.file_name, rule }),
      bytes: buffer.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "3Dデータを解析できませんでした",
      stage: "analyze",
    };
  }
}

/** Caller authorizes the work and upload path. Keep the current asset until parsing succeeds. */
export async function replaceAsset(
  workId: string,
  file: AssetFile,
): Promise<ValidateAssetResult> {
  const db = serviceDatabase();
  const result = await analyzeFile(db, file);
  if (!result.ok) return result;
  const { analysis, bytes } = result;
  const { data: variantIds, error } = await queryResult(
    db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("works")
        .select("id")
        .where("id", "=", workId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const previous = await tx
        .selectFrom("work_assets")
        .select("id")
        .where("work_id", "=", workId)
        .orderBy("is_primary", "desc")
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst();
      const values = {
        storage_path: file.storage_path,
        file_name: file.file_name,
        file_format: analysis.format,
        file_size_bytes: bytes,
        is_primary: true,
      };
      // Reuse the ID referenced by variants and preserve instructions through persistAnalysis.
      const asset = previous
        ? await tx
            .updateTable("work_assets")
            .set(values)
            .where("id", "=", previous.id)
            .returning("id")
            .executeTakeFirstOrThrow()
        : await tx
            .insertInto("work_assets")
            .values({ ...values, work_id: workId })
            .returning("id")
            .executeTakeFirstOrThrow();
      return persistAnalysis(tx, asset.id, workId, bytes, analysis);
    }),
  );
  if (error || !variantIds)
    return {
      ok: false,
      error: "3Dデータを保存できませんでした。もう一度お試しください",
      stage: "persist",
    };
  return { ok: true, analysis, variantIds };
}

/** Reanalyze the authorized asset; reject results if a replacement completed meanwhile. */
export async function validateAndPersistAsset(
  assetId: string,
  workId: string,
): Promise<ValidateAssetResult> {
  const db = serviceDatabase();
  const { data: asset, error: assetError } = await queryResult(
    db
      .selectFrom("work_assets")
      .select(["id", "storage_path", "file_name"])
      .where("id", "=", assetId)
      .where("work_id", "=", workId)
      .executeTakeFirstOrThrow(),
  );
  if (assetError || !asset)
    return {
      ok: false,
      error: "対象の3Dデータが見つかりません",
      stage: "load_asset",
    };
  const result = await analyzeFile(db, asset);
  if (!result.ok) {
    if (result.stage !== "analyze") return result;
    const { error } = await queryResult(
      db.transaction().execute(async (tx) => {
        await lockAsset(tx, workId, assetId, asset.storage_path);
        await tx
          .deleteFrom("work_validation_issues")
          .where("asset_id", "=", assetId)
          .execute();
        await tx
          .insertInto("work_validation_issues")
          .values({
            asset_id: assetId,
            code: "parse",
            severity: "error",
            message: result.error,
            detail: { fileName: asset.file_name },
          })
          .execute();
        await tx
          .updateTable("work_assets")
          .set({
            validation_status: "failed",
            validated_at: new Date().toISOString(),
          })
          .where("id", "=", assetId)
          .execute();
      }),
    );
    return {
      ...result,
      error: error ? "解析エラーを保存できませんでした" : result.error,
    };
  }
  const { analysis, bytes } = result;
  const { data: variantIds, error } = await queryResult(
    db.transaction().execute(async (tx) => {
      await lockAsset(tx, workId, assetId, asset.storage_path);
      return persistAnalysis(tx, assetId, workId, bytes, analysis);
    }),
  );
  if (error || !variantIds)
    return {
      ok: false,
      error: error?.message ?? "解析結果を保存できませんでした",
      stage: "persist",
    };
  return { ok: true, analysis, variantIds };
}

async function lockAsset(
  db: Db,
  workId: string,
  assetId: string,
  storagePath: string,
) {
  await db
    .selectFrom("works")
    .select("id")
    .where("id", "=", workId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const asset = await db
    .selectFrom("work_assets")
    .select("id")
    .where("id", "=", assetId)
    .where("work_id", "=", workId)
    .where("storage_path", "=", storagePath)
    .forUpdate()
    .executeTakeFirst();
  if (!asset)
    throw new Error("3Dデータが更新されています。画面を読み込み直してください");
}

/** All derived rows are saved together. Query failures must escape this transaction. */
async function persistAnalysis(
  db: Db,
  assetId: string,
  workId: string,
  bytes: number,
  analysis: AssetAnalysis,
) {
  await db
    .updateTable("work_assets")
    .set({
      file_size_bytes: bytes,
      unit: "mm",
      object_count: analysis.objectCount,
      triangle_count: analysis.triangleCount,
      vertex_count: analysis.vertexCount,
      total_volume_cm3: analysis.totalVolumeCm3,
      total_surface_area_cm2: analysis.totalSurfaceAreaCm2,
      bbox_x_mm: analysis.assembledBboxMm[0],
      bbox_y_mm: analysis.assembledBboxMm[1],
      bbox_z_mm: analysis.assembledBboxMm[2],
      validation_status: analysis.status,
      validated_at: new Date().toISOString(),
    })
    .where("id", "=", assetId)
    .execute();

  // Preserve instructions by part name, and material choices by source color.
  const previousObjects = await db
    .selectFrom("work_asset_objects")
    .select(["id", "name"])
    .where("asset_id", "=", assetId)
    .execute();
  const previousInstructions = await db
    .selectFrom("work_part_instructions")
    .select([
      "object_id",
      "orientation",
      "no_rotate",
      "support",
      "support_note",
      "note",
    ])
    .where("work_id", "=", workId)
    .execute();
  const instructionsById = new Map(
    previousInstructions.map((i) => [i.object_id, i]),
  );
  const instructionsByName = new Map(
    previousObjects.map((o) => [o.name, instructionsById.get(o.id)]),
  );
  const previousSlots = await db
    .selectFrom("work_color_slots")
    .select(["slot_index", "source_hex", "filament_id"])
    .where("asset_id", "=", assetId)
    .execute();

  await db
    .deleteFrom("work_asset_objects")
    .where("asset_id", "=", assetId)
    .execute();
  const objectRows: TablesInsert<"work_asset_objects">[] = analysis.objects.map(
    (o) => ({
      asset_id: assetId,
      object_index: o.objectIndex,
      name: o.name,
      triangle_count: o.triangleCount,
      bbox_x_mm: round(o.bboxMm[0], 2),
      bbox_y_mm: round(o.bboxMm[1], 2),
      bbox_z_mm: round(o.bboxMm[2], 2),
      volume_cm3: round(o.volumeCm3, 2),
      surface_area_cm2: round(o.surfaceAreaCm2, 2),
      is_manifold: o.isManifold,
      open_edge_count: o.openEdgeCount,
      flipped_normal_count: o.flippedNormalCount,
      self_intersection_count: o.selfIntersectionCount,
      min_wall_thickness_mm:
        o.minWallThicknessMm === null ? null : round(o.minWallThicknessMm, 2),
    }),
  );
  const objects = objectRows.length
    ? await db
        .insertInto("work_asset_objects")
        .values(objectRows)
        .returning(["id", "object_index"])
        .execute()
    : [];
  const objectIdByIndex = new Map(objects.map((o) => [o.object_index, o.id]));

  await db
    .deleteFrom("work_validation_issues")
    .where("asset_id", "=", assetId)
    .execute();
  if (analysis.issues.length)
    await db
      .insertInto("work_validation_issues")
      .values(
        analysis.issues.map((i) => ({
          asset_id: assetId,
          object_id:
            i.objectIndex === undefined
              ? null
              : (objectIdByIndex.get(i.objectIndex) ?? null),
          code: i.code,
          severity: i.severity,
          message: i.message,
          detail: i.detail as Json,
        })),
      )
      .execute();

  await db
    .deleteFrom("work_color_slots")
    .where("asset_id", "=", assetId)
    .execute();
  if (analysis.colorSlots.length)
    await db
      .insertInto("work_color_slots")
      .values(
        analysis.colorSlots.map((c) => ({
          work_id: workId,
          asset_id: assetId,
          slot_index: c.slotIndex,
          source_name: c.sourceName,
          source_hex: c.sourceHex,
          face_count: c.faceCount,
          filament_id:
            previousSlots.find(
              (p) =>
                p.slot_index === c.slotIndex && p.source_hex === c.sourceHex,
            )?.filament_id ?? null,
        })),
      )
      .execute();

  const instructions = analysis.objects.map((o) => {
    const carried = instructionsByName.get(o.name);
    const defaults = defaultInstruction(o.bboxMm);
    return {
      work_id: workId,
      object_id: objectIdByIndex.get(o.objectIndex)!,
      orientation: carried?.orientation ?? defaults.orientation,
      no_rotate: carried?.no_rotate ?? defaults.orientation === "flat",
      support: carried?.support ?? defaults.support,
      support_note: carried?.support_note ?? null,
      note: carried ? carried.note : defaults.note,
    };
  });
  if (instructions.length)
    await db
      .insertInto("work_part_instructions")
      .values(instructions)
      .execute();

  // Prices, stock and publishing choices belong to the creator; retain them on reanalysis.
  const previousVariants = await db
    .selectFrom("work_variants")
    .select([
      "id",
      "size_label",
      "price_jpy",
      "stock",
      "is_listed",
      "batch_count_override",
    ])
    .where("work_id", "=", workId)
    .execute();
  const variantsBySize = new Map(
    previousVariants.map((v) => [v.size_label, v]),
  );
  const variantIds: string[] = [];
  for (const v of analysis.variants) {
    const previous = variantsBySize.get(v.sizeLabel);
    const row = {
      work_id: workId,
      size_label: v.sizeLabel,
      nui_size_cm: v.nuiSizeCm,
      scale_ratio: round(v.scaleRatio, 4),
      is_base: v.scaleRatio === 1,
      asset_id: assetId,
      bbox_x_mm: round(v.bboxMm[0], 2),
      bbox_y_mm: round(v.bboxMm[1], 2),
      bbox_z_mm: round(v.bboxMm[2], 2),
      max_part_bbox_x_mm: round(v.maxPartBboxMm[0], 2),
      max_part_bbox_y_mm: round(v.maxPartBboxMm[1], 2),
      max_part_bbox_z_mm: round(v.maxPartBboxMm[2], 2),
      oversized_parts: v.oversizedParts,
      est_filament_grams: v.grams,
      est_print_hours: v.hours,
      part_count: v.partCount,
      batch_count_override: previous?.batch_count_override ?? null,
      price_jpy: previous?.price_jpy ?? null,
      stock: previous?.stock ?? null,
      is_listed: v.isPrintable ? (previous?.is_listed ?? false) : false,
    };
    const returning = [
      "id",
      "print_fee_jpy",
      "batch_count",
      "is_printable",
      "unprintable_reason",
    ] as const;
    const saved = previous
      ? await db
          .updateTable("work_variants")
          .set(row)
          .where("id", "=", previous.id)
          .returning(returning)
          .executeTakeFirstOrThrow()
      : await db
          .insertInto("work_variants")
          .values(row)
          .returning(returning)
          .executeTakeFirstOrThrow();
    variantIds.push(saved.id);
    v.printFeeJpy = saved.print_fee_jpy ?? v.printFeeJpy;
    v.batchCount = saved.batch_count;
    v.isPrintable = saved.is_printable;
    v.unprintableReason = saved.unprintable_reason;
  }
  return variantIds;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

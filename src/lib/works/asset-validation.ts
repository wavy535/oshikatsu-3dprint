import { type CompiledQuery } from "kysely";
import { atomicBatch, assertQuery } from "@/lib/db/client";
import type { Statement } from "@/lib/db/d1/runtime";
import { combinedEstimates } from "./combined-estimates";
import { MAX_PRINT_FILES, MAX_PRINT_UPLOAD_BYTES } from "./asset-limits";
import { platform } from "@/lib/platform";
import { analyzeStoredModel } from "@/lib/geometry";
import { readModel } from "@/lib/files/storage";
import { queryResult } from "@/lib/db/result";
import "server-only";

import {
  analyzeModelFile,
  type AssetAnalysis,
  type PricingRule,
} from "@/lib/print";
import { serviceDatabase, type Db } from "@/lib/db/client";
import type { Json, PrintOrientation, SupportMode } from "@/types/db";

// STEP1 のアップロード後に走る検証パイプライン。
//   R2から 3D データを落とす → 解析する → 結果をDBに書く
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

async function analyzeFile(
  rule: PricingRule,
  asset: AssetFile,
): Promise<AnalysisResult> {
  if (platform().GEOMETRY) {
    try {
      return {
        ok: true,
        ...(await analyzeStoredModel(
          asset.storage_path,
          asset.file_name,
          rule,
          asset.file_size_bytes,
        )),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "解析に失敗しました",
        stage: "analyze",
      };
    }
  }
  if (process.env.APP_RUNTIME === "cloudflare")
    return { ok: false, error: "解析サービスが未設定です", stage: "analyze" };

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

/** Analyze outside the database, then commit one version-checked D1 batch. */
export async function replaceAsset(
  workId: string,
  file: AssetFile,
  assetId: string,
): Promise<ValidateAssetResult> {
  const db = serviceDatabase();
  const pricing = await pricingForAnalysis(db);
  if (!pricing.ok) return pricing;
  const result = await analyzeFile(pricing.rule, file);
  if (!result.ok) return result;
  return saveAnalyzed(
    db,
    workId,
    [{ ...result, file, assetId }],
    pricing.rule,
    "replace",
  );
}

export async function appendAssets(
  workId: string,
  files: AssetFile[],
): Promise<ValidateAssetResult> {
  if (
    !files.length ||
    files.length > MAX_PRINT_FILES ||
    files.reduce((sum, file) => sum + (file.file_size_bytes ?? 0), 0) >
      MAX_PRINT_UPLOAD_BYTES
  )
    return {
      ok: false,
      error: "一度に16ファイル・合計80MiBまで選べます",
      stage: "input",
    };
  const db = serviceDatabase();
  const pricing = await pricingForAnalysis(db);
  if (!pricing.ok) return pricing;
  const analyzed: AnalyzedFile[] = [];
  for (const file of files) {
    const result = await analyzeFile(pricing.rule, file);
    if (!result.ok)
      return { ...result, error: `${file.file_name}: ${result.error}` };
    analyzed.push({ ...result, file, assetId: crypto.randomUUID() });
  }
  return saveAnalyzed(db, workId, analyzed, pricing.rule, "append");
}

export async function validateAndPersistAsset(
  assetId: string,
  workId: string,
): Promise<ValidateAssetResult> {
  const db = serviceDatabase();
  const { data: asset, error } = await queryResult(
    db
      .selectFrom("work_assets")
      .select(["id", "storage_path", "file_name"])
      .where("id", "=", assetId)
      .where("work_id", "=", workId)
      .executeTakeFirstOrThrow(),
  );
  if (error || !asset)
    return {
      ok: false,
      error: "対象の3Dデータが見つかりません",
      stage: "load_asset",
    };
  const pricing = await pricingForAnalysis(db);
  if (!pricing.ok) return pricing;
  const result = await analyzeFile(pricing.rule, asset);
  if (!result.ok) {
    if (result.stage !== "analyze") return result;
    const saved = await queryResult(
      atomicBatch(db, [
        assertQuery(
          db
            .selectFrom("work_assets")
            .select("id")
            .where("id", "=", assetId)
            .where("work_id", "=", workId)
            .where("storage_path", "=", asset.storage_path),
        ),
        db.deleteFrom("work_validation_issues").where("asset_id", "=", assetId),
        db
          .insertInto("work_validation_issues")
          .values({
            asset_id: assetId,
            code: "parse",
            severity: "error",
            message: result.error,
            detail: { fileName: asset.file_name },
          }),
        db
          .updateTable("work_assets")
          .set({
            validation_status: "failed",
            validated_at: new Date().toISOString(),
          })
          .where("id", "=", assetId),
      ]),
    );
    return {
      ...result,
      error: saved.error ? "解析エラーを保存できませんでした" : result.error,
    };
  }
  return saveAnalyzed(
    db,
    workId,
    [{ ...result, file: asset, assetId, expectedPath: asset.storage_path }],
    pricing.rule,
    "replace",
  );
}

type AnalyzedFile = {
  file: AssetFile;
  assetId: string;
  expectedPath?: string;
  analysis: AssetAnalysis;
  bytes: number;
};
type BatchQuery = Statement | { compile(): CompiledQuery };
async function workSnapshot(db: Db, workId: string) {
  // Version is read first; the final batch rejects any intervening edit, including
  // changes to instructions/materials while the remaining rows are being read.
  const work = await db
    .selectFrom("works")
    .select(["id", "edit_version"])
    .where("id", "=", workId)
    .executeTakeFirstOrThrow();
  const assets = await db
    .selectFrom("work_assets")
    .selectAll()
    .where("work_id", "=", workId)
    .orderBy("is_primary", "desc")
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const [objects, instructions, slots, variants] = await Promise.all([
    db
      .selectFrom("work_asset_objects as o")
      .innerJoin("work_assets as a", "a.id", "o.asset_id")
      .selectAll("o")
      .where("a.work_id", "=", workId)
      .execute(),
    db
      .selectFrom("work_part_instructions")
      .selectAll()
      .where("work_id", "=", workId)
      .execute(),
    db
      .selectFrom("work_color_slots")
      .selectAll()
      .where("work_id", "=", workId)
      .execute(),
    db
      .selectFrom("work_variants")
      .selectAll()
      .where("work_id", "=", workId)
      .execute(),
  ]);
  return { work, assets, objects, instructions, slots, variants };
}

async function saveAnalyzed(
  db: Db,
  workId: string,
  analyzed: AnalyzedFile[],
  rule: PricingRule,
  mode: "append" | "replace",
): Promise<ValidateAssetResult> {
  const latest = analyzed.at(-1)!.analysis;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const snapshot = await workSnapshot(db, workId);
      const additions =
        mode === "append"
          ? analyzed.filter(
              (item) =>
                !snapshot.assets.some(
                  (asset) => asset.storage_path === item.file.storage_path,
                ),
            )
          : analyzed;
      if (
        mode === "append" &&
        snapshot.assets.length + additions.length > MAX_PRINT_FILES
      )
        throw new Error("1作品に登録できる印刷用ファイルは16個までです");
      if (
        mode === "replace" &&
        additions.some(
          (item) =>
            !snapshot.assets.some(
              (asset) =>
                asset.id === item.assetId &&
                (!item.expectedPath ||
                  asset.storage_path === item.expectedPath),
            ),
        )
      )
        throw new Error(
          "3Dデータが更新されています。画面を読み込み直してください",
        );
      if (!additions.length)
        return {
          ok: true,
          analysis: latest,
          variantIds: snapshot.variants.map((v) => v.id),
        };
      const queries: BatchQuery[] = [
        assertQuery(
          db
            .selectFrom("works")
            .select("id")
            .where("id", "=", workId)
            .where("edit_version", "=", snapshot.work.edit_version),
        ),
      ];
      for (const [index, item] of additions.entries()) {
        const { analysis, assetId, file, bytes } = item;
        const metadata = {
          storage_path: file.storage_path,
          file_name: file.file_name,
          file_format: analysis.format,
          file_size_bytes: bytes,
          unit: "mm",
          object_count: analysis.objectCount,
          triangle_count: analysis.triangleCount,
          vertex_count: analysis.vertexCount,
          total_volume_cm3: round(analysis.totalVolumeCm3, 8),
          total_surface_area_cm2: round(analysis.totalSurfaceAreaCm2, 8),
          bbox_x_mm: analysis.assembledBboxMm[0],
          bbox_y_mm: analysis.assembledBboxMm[1],
          bbox_z_mm: analysis.assembledBboxMm[2],
          validation_status: analysis.status,
          validated_at: new Date().toISOString(),
        };
        queries.push(
          mode === "append"
            ? db
                .insertInto("work_assets")
                .values({
                  id: assetId,
                  work_id: workId,
                  ...metadata,
                  is_primary: snapshot.assets.length === 0 && index === 0,
                })
            : db
                .updateTable("work_assets")
                .set(metadata)
                .where("id", "=", assetId)
                .where("work_id", "=", workId),
        );
        const carried = new Map(
          snapshot.objects
            .filter((o) => o.asset_id === assetId)
            .map((o) => [
              o.name,
              snapshot.instructions.find((i) => i.object_id === o.id),
            ]),
        );
        queries.push(
          db.deleteFrom("work_asset_objects").where("asset_id", "=", assetId),
          db
            .deleteFrom("work_validation_issues")
            .where("asset_id", "=", assetId),
          db.deleteFrom("work_color_slots").where("asset_id", "=", assetId),
        );
        const objects = analysis.objects.map((o) => ({
          id: crypto.randomUUID(),
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
            o.minWallThicknessMm === null
              ? null
              : round(o.minWallThicknessMm, 2),
        }));
        if (objects.length)
          queries.push(db.insertInto("work_asset_objects").values(objects));
        const ids = new Map(objects.map((o) => [o.object_index, o.id]));
        if (analysis.issues.length)
          queries.push(
            db
              .insertInto("work_validation_issues")
              .values(
                analysis.issues.map((i) => ({
                  asset_id: assetId,
                  object_id:
                    i.objectIndex === undefined
                      ? null
                      : (ids.get(i.objectIndex) ?? null),
                  code: i.code,
                  severity: i.severity,
                  message: i.message,
                  detail: i.detail as Json,
                })),
              ),
          );
        if (analysis.colorSlots.length)
          queries.push(
            db
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
                    snapshot.slots.find(
                      (p) =>
                        p.asset_id === assetId &&
                        p.slot_index === c.slotIndex &&
                        p.source_hex === c.sourceHex,
                    )?.filament_id ?? null,
                })),
              ),
          );
        if (objects.length)
          queries.push(
            db.insertInto("work_part_instructions").values(
              analysis.objects.map((o) => {
                const previous = carried.get(o.name),
                  defaults = defaultInstruction(o.bboxMm);
                return {
                  work_id: workId,
                  object_id: ids.get(o.objectIndex)!,
                  orientation: previous?.orientation ?? defaults.orientation,
                  no_rotate:
                    previous?.no_rotate ?? defaults.orientation === "flat",
                  support: previous?.support ?? defaults.support,
                  support_note: previous?.support_note ?? null,
                  note: previous ? previous.note : defaults.note,
                };
              }),
            ),
          );
      }
      const assetRows = snapshot.assets
        .filter((asset) => !additions.some((item) => item.assetId === asset.id))
        .map((asset) => ({
          ...asset,
          objects: snapshot.objects.filter((o) => o.asset_id === asset.id),
        }));
      const combined = [
        ...assetRows.map((asset) => ({
          id: asset.id,
          file_name: asset.file_name,
          total_volume_cm3: asset.total_volume_cm3,
          total_surface_area_cm2: asset.total_surface_area_cm2,
          validation_status: asset.validation_status,
          objects: asset.objects,
        })),
        ...additions.map((item) => ({
          id: item.assetId,
          file_name: item.file.file_name,
          total_volume_cm3: round(item.analysis.totalVolumeCm3, 8),
          total_surface_area_cm2: round(item.analysis.totalSurfaceAreaCm2, 8),
          validation_status: item.analysis.status,
          objects: item.analysis.objects.map((o) => ({
            name: o.name,
            bbox_x_mm: round(o.bboxMm[0], 2),
            bbox_y_mm: round(o.bboxMm[1], 2),
            bbox_z_mm: round(o.bboxMm[2], 2),
          })),
        })),
      ];
      const primaryId = snapshot.assets[0]?.id ?? additions[0].assetId;
      const estimates =
        combined.length === 1
          ? latest.variants
          : combinedEstimates(combined, latest.variants, rule);
      const allValid = combined.every(
        (a) =>
          a.validation_status === "passed" || a.validation_status === "warning",
      );
      const variantIds: string[] = [];
      for (const v of estimates) {
        const previous = snapshot.variants.find(
          (p) => p.size_label === v.sizeLabel,
        );
        const id = previous?.id ?? crypto.randomUUID();
        variantIds.push(id);
        const row = {
          work_id: workId,
          size_label: v.sizeLabel,
          nui_size_cm: v.nuiSizeCm,
          scale_ratio: round(v.scaleRatio, 4),
          is_base: v.scaleRatio === 1,
          asset_id: primaryId,
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
          is_listed:
            allValid && v.isPrintable ? (previous?.is_listed ?? false) : false,
        };
        queries.push(
          previous
            ? db.updateTable("work_variants").set(row).where("id", "=", id)
            : db.insertInto("work_variants").values({ id, ...row }),
        );
      }
      await atomicBatch(db, queries);
      return { ok: true, analysis: latest, variantIds };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "解析結果を保存できませんでした";
      if (attempt < 2 && message.includes("更新対象が変わりました")) continue;
      return { ok: false, error: message, stage: "persist" };
    }
  }
  return {
    ok: false,
    error: "作品が更新されています。再度お試しください",
    stage: "persist",
  };
}

function round(v: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(v * factor) / factor;
}
async function pricingForAnalysis(
  db: Db,
): Promise<
  { ok: true; rule: PricingRule } | Extract<ValidateAssetResult, { ok: false }>
> {
  const { data: rule, error } = await queryResult(loadPricingRule(db));
  return error || !rule
    ? {
        ok: false,
        error: "印刷料金の設定を取得できませんでした",
        stage: "pricing",
      }
    : { ok: true, rule };
}

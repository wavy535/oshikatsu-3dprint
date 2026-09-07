import { analyzeModelFile, type AssetAnalysis, type PricingRule } from "@/lib/print";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database, Json, PrintOrientation, SupportMode } from "@/types/db";

// STEP1 のアップロード後に走る検証パイプライン。
//   Storage から 3D データを落とす → 解析する → 結果をDBに書く
// までを1本にまとめている。再実行しても同じ結果になるよう、
// 解析由来の行は毎回作り直し、クリエイターが手で決めた値（色の割り当て・
// 価格・在庫・公開設定）は残す。

const MODEL_BUCKET = "work-stl";

export type ValidateAssetResult =
  | { ok: true; analysis: AssetAnalysis; variantIds: string[] }
  | { ok: false; error: string; stage: string };

type Supabase = ReturnType<typeof createServiceRoleClient>;

async function loadPricingRule(supabase: Supabase): Promise<PricingRule | undefined> {
  const { data } = await supabase
    .from("print_pricing_rules")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data) return undefined;
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

export async function validateAndPersistAsset(assetId: string): Promise<ValidateAssetResult> {
  const supabase = createServiceRoleClient();

  // --- 1. 対象のアセットを取る ------------------------------------------------
  const { data: asset, error: assetError } = await supabase
    .from("work_assets")
    .select("id, work_id, storage_path, file_name, file_format")
    .eq("id", assetId)
    .single();

  if (assetError || !asset) {
    return { ok: false, error: "対象の3Dデータが見つかりません", stage: "load_asset" };
  }

  // --- 2. Storage から落とす --------------------------------------------------
  const { data: blob, error: downloadError } = await supabase.storage
    .from(MODEL_BUCKET)
    .download(asset.storage_path);

  if (downloadError || !blob) {
    return {
      ok: false,
      error: `3Dデータを読み込めませんでした（${downloadError?.message ?? "不明なエラー"}）`,
      stage: "download",
    };
  }
  const buffer = Buffer.from(await blob.arrayBuffer());

  // --- 3. 解析 ---------------------------------------------------------------
  const rule = await loadPricingRule(supabase);
  let analysis: AssetAnalysis;
  try {
    analysis = analyzeModelFile(buffer, { fileName: asset.file_name, rule });
  } catch (e) {
    const message = e instanceof Error ? e.message : "3Dデータを解析できませんでした";
    // 解析自体が失敗した場合も、理由を1件の issue として残す
    await supabase.from("work_validation_issues").delete().eq("asset_id", assetId);
    await supabase.from("work_validation_issues").insert({
      asset_id: assetId,
      code: "parse",
      severity: "error",
      message,
      detail: { fileName: asset.file_name },
    });
    await supabase
      .from("work_assets")
      .update({ validation_status: "failed", validated_at: new Date().toISOString() })
      .eq("id", assetId);
    return { ok: false, error: message, stage: "analyze" };
  }

  // --- 4. アセット本体を更新 --------------------------------------------------
  const { error: updateError } = await supabase
    .from("work_assets")
    .update({
      file_size_bytes: buffer.byteLength,
      unit: "mm",
      object_count: analysis.objectCount,
      triangle_count: analysis.triangleCount,
      vertex_count: analysis.vertexCount,
      total_volume_cm3: analysis.totalVolumeCm3,
      total_surface_area_cm2: analysis.totalSurfaceAreaCm2,
      // 表示に使うのは「組み立て後のおおよその大きさ」。
      // プレート上の並び方をそのまま入れると、横に長い箱になってしまう。
      bbox_x_mm: analysis.assembledBboxMm[0],
      bbox_y_mm: analysis.assembledBboxMm[1],
      bbox_z_mm: analysis.assembledBboxMm[2],
      validation_status: analysis.status,
      validated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  if (updateError) {
    return { ok: false, error: updateError.message, stage: "update_asset" };
  }

  // --- 5. オブジェクト（＝分割パーツ）を作り直す -------------------------------
  // 既存の印刷指示は object_id で紐づいているので、名前で引き継ぐ
  const { data: previousObjects } = await supabase
    .from("work_asset_objects")
    .select("id, name")
    .eq("asset_id", assetId);

  const { data: previousInstructions } = await supabase
    .from("work_part_instructions")
    .select("object_id, orientation, no_rotate, support, support_note, note")
    .eq("work_id", asset.work_id);

  const instructionByName = new Map<
    string,
    NonNullable<typeof previousInstructions>[number]
  >();
  for (const obj of previousObjects ?? []) {
    const hit = (previousInstructions ?? []).find((i) => i.object_id === obj.id);
    if (hit) instructionByName.set(obj.name, hit);
  }

  await supabase.from("work_asset_objects").delete().eq("asset_id", assetId);

  const objectRows: Database["public"]["Tables"]["work_asset_objects"]["Insert"][] =
    analysis.objects.map((o) => ({
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
    }));

  const { data: insertedObjects, error: objectError } = await supabase
    .from("work_asset_objects")
    .insert(objectRows)
    .select("id, object_index, name");

  if (objectError || !insertedObjects) {
    return { ok: false, error: objectError?.message ?? "パーツを保存できませんでした", stage: "objects" };
  }

  const objectIdByIndex = new Map<number, string>();
  for (const row of insertedObjects) objectIdByIndex.set(row.object_index, row.id);

  // --- 6. 検証結果 -----------------------------------------------------------
  await supabase.from("work_validation_issues").delete().eq("asset_id", assetId);

  const issueRows = analysis.issues.map((i) => ({
    asset_id: assetId,
    object_id:
      i.objectIndex !== undefined ? objectIdByIndex.get(i.objectIndex) ?? null : null,
    code: i.code,
    severity: i.severity,
    message: i.message,
    detail: i.detail as Json,
  }));

  const { error: issueError } = await supabase.from("work_validation_issues").insert(issueRows);
  if (issueError) {
    return { ok: false, error: issueError.message, stage: "issues" };
  }

  // --- 7. 色スロット ---------------------------------------------------------
  // 既に運営在庫のフィラメントを割り当て済みなら、その選択は残す
  const { data: previousSlots } = await supabase
    .from("work_color_slots")
    .select("slot_index, source_hex, filament_id")
    .eq("asset_id", assetId);

  await supabase.from("work_color_slots").delete().eq("asset_id", assetId);

  if (analysis.colorSlots.length > 0) {
    const slotRows = analysis.colorSlots.map((c) => {
      const previous = (previousSlots ?? []).find(
        (p) => p.slot_index === c.slotIndex && p.source_hex === c.sourceHex
      );
      return {
        work_id: asset.work_id,
        asset_id: assetId,
        slot_index: c.slotIndex,
        source_name: c.sourceName,
        source_hex: c.sourceHex,
        face_count: c.faceCount,
        filament_id: previous?.filament_id ?? null,
      };
    });
    const { error: slotError } = await supabase.from("work_color_slots").insert(slotRows);
    if (slotError) return { ok: false, error: slotError.message, stage: "color_slots" };
  }

  // --- 8. パーツごとの印刷指示（既定値を用意しておく） --------------------------
  const instructionRows = analysis.objects.map((o) => {
    const objectId = objectIdByIndex.get(o.objectIndex)!;
    const carried = instructionByName.get(o.name);
    if (carried) {
      return {
        work_id: asset.work_id,
        object_id: objectId,
        orientation: carried.orientation,
        no_rotate: carried.no_rotate,
        support: carried.support,
        support_note: carried.support_note,
        note: carried.note,
      };
    }
    const d = defaultInstruction(o.bboxMm);
    return {
      work_id: asset.work_id,
      object_id: objectId,
      orientation: d.orientation,
      no_rotate: d.orientation === "flat",
      support: d.support,
      support_note: null,
      note: d.note,
    };
  });

  const { error: instructionError } = await supabase
    .from("work_part_instructions")
    .insert(instructionRows);
  if (instructionError) {
    return { ok: false, error: instructionError.message, stage: "part_instructions" };
  }

  // --- 9. サイズ展開 ---------------------------------------------------------
  // 価格・在庫・公開設定はクリエイターが決めるものなので、既存値を引き継ぐ
  const { data: previousVariants } = await supabase
    .from("work_variants")
    .select("id, size_label, price_jpy, stock, is_listed, batch_count_override")
    .eq("work_id", asset.work_id);

  const variantIds: string[] = [];
  for (const v of analysis.variants) {
    const previous = (previousVariants ?? []).find((p) => p.size_label === v.sizeLabel);
    const row = {
      work_id: asset.work_id,
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
      // print_fee_jpy / batch_count / is_printable は
      // sync_work_variant トリガーが単価マスタから計算し直す
      batch_count_override: previous?.batch_count_override ?? null,
      price_jpy: previous?.price_jpy ?? null,
      stock: previous?.stock ?? null,
      is_listed: v.isPrintable ? previous?.is_listed ?? false : false,
    };

    // トリガーが計算し直した代行費・バッチ数・印刷可否を読み戻す。
    // 画面には必ずDBの値を出す（JS側の計算と1円でもずれると混乱するため）。
    const columns = "id, print_fee_jpy, batch_count, is_printable, unprintable_reason";
    const { data: saved, error: variantError } = previous
      ? await supabase.from("work_variants").update(row).eq("id", previous.id).select(columns).single()
      : await supabase.from("work_variants").insert(row).select(columns).single();

    if (variantError) {
      return { ok: false, error: variantError.message, stage: `variant:${v.sizeLabel}` };
    }
    if (saved) {
      variantIds.push(saved.id);
      v.printFeeJpy = saved.print_fee_jpy ?? v.printFeeJpy;
      v.batchCount = saved.batch_count;
      v.isPrintable = saved.is_printable;
      v.unprintableReason = saved.unprintable_reason;
    }
  }

  return { ok: true, analysis, variantIds };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

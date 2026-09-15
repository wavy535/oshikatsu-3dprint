import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { CALIBRATION_MODELS, type CalibrationModel } from "./calibration.ts";
import { AR_LIMITS } from "./config.ts";
import { ROOM_LAYOUTS, type NuiDimensions, type RoomLayout } from "./room.ts";

export const MODEL_FORMATS = ["glb", "usdz"] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];

const ROOM_ROUTE = "/api/ar/rooms";
const WORK_ROUTE = "/api/ar/works";
const CALIBRATION_ROUTE = "/api/ar/calibration";
// モデルの版（modelRevision）を載せるクエリ名
const REVISION_PARAM = "rev";
// Quick Look に拡大縮小させない指定（AR Quick Look が URL のフラグメントで受け取る）
const QUICK_LOOK_FIXED_SCALE = "allowsContentScaling=0";

const dimension = z.coerce
  .number()
  .min(AR_LIMITS.nuiDimensionMinMm)
  .max(AR_LIMITS.nuiDimensionMaxMm);

const nuiQuerySchema = z
  .object({ sit: dimension, shoulder: dimension.optional(), hug: dimension.optional() })
  .refine((query) => query.shoulder !== undefined || query.hug !== undefined);

function splitModelFile(file: string) {
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return null;
  const format = MODEL_FORMATS.find((candidate) => candidate === file.slice(dot + 1));
  return format ? { name: file.slice(0, dot), format } : null;
}

export const isId = (value: string) => idSchema.safeParse(value).success;

/** URL に付いたモデルの版。付いていなければ null */
export const revisionOfUrl = (params: URLSearchParams) => params.get(REVISION_PARAM);

/** "three-walls.glb" / "back-left.usdz" のようなファイル名から部屋の形と形式を取り出す */
export function parseRoomFile(file: string): { layout: RoomLayout; format: ModelFormat } | null {
  const parts = splitModelFile(file);
  const layout = ROOM_LAYOUTS.find((candidate) => candidate === parts?.name);
  return parts && layout ? { layout, format: parts.format } : null;
}

/** "a4-plate.usdz" のようなファイル名から校正用モデルと形式を取り出す */
export function parseCalibrationFile(file: string): { model: CalibrationModel; format: ModelFormat } | null {
  const parts = splitModelFile(file);
  const model = CALIBRATION_MODELS.find((candidate) => candidate === parts?.name);
  return parts && model ? { model, format: parts.format } : null;
}

/** URL の sit / shoulder / hug（mm）を採寸値にする。範囲外や幅がないときは null */
export function parseNuiQuery(params: URLSearchParams): NuiDimensions | null {
  const result = nuiQuerySchema.safeParse({
    sit: params.get("sit") ?? undefined,
    shoulder: params.get("shoulder") ?? undefined,
    hug: params.get("hug") ?? undefined,
  });
  if (!result.success) return null;
  return {
    sitHeightMm: result.data.sit,
    shoulderWidthMm: result.data.shoulder ?? null,
    hugWidthMm: result.data.hug ?? null,
  };
}

/** parseNuiQuery の逆。採寸値を URL のクエリにする */
export function nuiSearchParams(nui: NuiDimensions) {
  const query = new URLSearchParams({ sit: String(nui.sitHeightMm) });
  if (nui.shoulderWidthMm !== null) query.set("shoulder", String(nui.shoulderWidthMm));
  if (nui.hugWidthMm !== null) query.set("hug", String(nui.hugWidthMm));
  return query;
}

export function roomModelPath(
  layout: RoomLayout,
  nui: NuiDimensions,
  revision: string,
  format: ModelFormat = "glb",
) {
  const query = nuiSearchParams(nui);
  query.set(REVISION_PARAM, revision);
  return `${ROOM_ROUTE}/${layout}.${format}?${query}`;
}

export function calibrationModelPath(model: CalibrationModel, revision: string, format: ModelFormat = "glb") {
  return `${CALIBRATION_ROUTE}/${model}.${format}?${new URLSearchParams({ [REVISION_PARAM]: revision })}`;
}

/** "<サイズのID>.glb" からサイズの ID を取り出す */
export function parseWorkFile(file: string): string | null {
  const parts = splitModelFile(file);
  return parts?.format === "glb" && isId(parts.name) ? parts.name : null;
}

export function workModelPath(workId: string, variantId: string, version: string, revision: string) {
  const query = new URLSearchParams({ v: version, [REVISION_PARAM]: revision });
  return `${WORK_ROUTE}/${workId}/${variantId}.glb?${query}`;
}

/**
 * iPhone の Safari で開くと、そのまま Quick Look の AR が実寸固定で起動する URL。
 * QR コードにするので、スマホから届く origin（http://192.168.x.x:3000 など）を付けた絶対 URL にする。
 */
export function quickLookUrl(origin: string, usdzPath: string) {
  return `${origin}${usdzPath}#${QUICK_LOOK_FIXED_SCALE}`;
}

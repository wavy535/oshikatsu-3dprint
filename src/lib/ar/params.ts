import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { AR_LIMITS } from "./config.ts";
import { ROOM_LAYOUTS, type NuiDimensions, type RoomLayout } from "./room.ts";

const GLB_EXTENSION = ".glb";
const ROOM_ROUTE = "/api/ar/rooms";
const WORK_ROUTE = "/api/ar/works";

const dimension = z.coerce
  .number()
  .min(AR_LIMITS.nuiDimensionMinMm)
  .max(AR_LIMITS.nuiDimensionMaxMm);

const nuiQuerySchema = z
  .object({ sit: dimension, shoulder: dimension.optional(), hug: dimension.optional() })
  .refine((query) => query.shoulder !== undefined || query.hug !== undefined);

function withoutGlbExtension(file: string) {
  return file.endsWith(GLB_EXTENSION) ? file.slice(0, -GLB_EXTENSION.length) : null;
}

export const isId = (value: string) => idSchema.safeParse(value).success;

/** "three-walls.glb" のようなファイル名から部屋の形を取り出す */
export function parseRoomFile(file: string): RoomLayout | null {
  const name = withoutGlbExtension(file);
  return ROOM_LAYOUTS.find((layout) => layout === name) ?? null;
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

export function roomModelPath(layout: RoomLayout, nui: NuiDimensions) {
  return `${ROOM_ROUTE}/${layout}${GLB_EXTENSION}?${nuiSearchParams(nui)}`;
}

/** "<サイズのID>.glb" からサイズの ID を取り出す */
export function parseWorkFile(file: string): string | null {
  const name = withoutGlbExtension(file);
  return name !== null && isId(name) ? name : null;
}

export function workModelPath(workId: string, variantId: string, version: string) {
  return `${WORK_ROUTE}/${workId}/${variantId}${GLB_EXTENSION}?${new URLSearchParams({ v: version })}`;
}

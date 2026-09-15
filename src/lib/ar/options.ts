import { nuiSearchParams, parseNuiQuery, roomModelPath, workModelPath } from "./params.ts";
import { ROOM_LAYOUTS, roomInteriorMm, type NuiDimensions, type RoomLayout } from "./room.ts";

/** nui_profiles の行を採寸値にする（numeric 列が文字列で届いても数値にそろえる） */
export function nuiDimensionsOf(profile: {
  sit_height_mm: number | string;
  shoulder_width_mm: number | string | null;
  hug_width_mm: number | string | null;
}): NuiDimensions {
  const optional = (value: number | string | null) => (value === null ? null : Number(value));
  return {
    sitHeightMm: Number(profile.sit_height_mm),
    shoulderWidthMm: optional(profile.shoulder_width_mm),
    hugWidthMm: optional(profile.hug_width_mm),
  };
}

export type ArModelKind = "work" | RoomLayout;
export type ArModelOption = { kind: ArModelKind; src: string };
export type RoomUnavailableReason = "signed_out" | "no_nui" | "no_width" | "out_of_range";

/**
 * 作品詳細で AR に出せるモデルの一覧。
 * 作品の3Dデータがあれば作品を、メインのぬいの採寸値があれば仮の部屋2種を並べる。
 */
export function buildArModelOptions(input: {
  workId: string;
  variantId: string | null;
  assetVersion: string | null;
  signedIn: boolean;
  nui: NuiDimensions | null;
}) {
  const options: ArModelOption[] = [];
  if (input.variantId && input.assetVersion) {
    options.push({ kind: "work", src: workModelPath(input.workId, input.variantId, input.assetVersion) });
  }

  const roomUnavailable = roomUnavailableReason(input.signedIn, input.nui);
  if (roomUnavailable === null && input.nui) {
    for (const layout of ROOM_LAYOUTS) {
      options.push({ kind: layout, src: roomModelPath(layout, input.nui) });
    }
  }
  return {
    options,
    roomUnavailable,
    interiorMm: roomUnavailable === null && input.nui ? roomInteriorMm(input.nui) : null,
  };
}

function roomUnavailableReason(signedIn: boolean, nui: NuiDimensions | null): RoomUnavailableReason | null {
  if (!signedIn) return "signed_out";
  if (!nui) return "no_nui";
  if (nui.hugWidthMm === null && nui.shoulderWidthMm === null) return "no_width";
  // URL で受け取れない値（範囲外）の部屋は、表示しても読み込めないので出さない
  return parseNuiQuery(nuiSearchParams(nui)) ? null : "out_of_range";
}

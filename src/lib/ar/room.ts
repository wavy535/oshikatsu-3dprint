import { AR_MATERIALS, AR_ROOM } from "./config.ts";
import { ArInputError } from "./errors.ts";
import { boxMesh, type ArMaterial, type ArMesh, type Rgba, type Vec3 } from "./mesh.ts";

export const ROOM_LAYOUTS = ["three-walls", "back-left"] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

/** マイぬいの採寸値（mm）。nui_profiles の列に対応する */
export type NuiDimensions = {
  sitHeightMm: number;
  shoulderWidthMm: number | null;
  hugWidthMm: number | null;
};

const MM_PER_M = 1000;

/**
 * ぬいの大きさの目安（箱）。相性判定（nui_fit_axes）と同じ対応で、
 * 幅と奥行きは抱き幅（なければ肩幅）、高さは座高を使う。
 */
export function nuiGuideSizeMm(nui: NuiDimensions) {
  const width = nui.hugWidthMm ?? nui.shoulderWidthMm;
  if (width === null) throw new ArInputError("肩幅か抱き幅が登録されていません");
  return { widthMm: width, depthMm: width, heightMm: nui.sitHeightMm };
}

/** 仮の部屋の内寸（mm）。目安の箱に設定の余白を足す */
export function roomInteriorMm(nui: NuiDimensions) {
  const guide = nuiGuideSizeMm(nui);
  return {
    widthMm: guide.widthMm + AR_ROOM.sideMarginMm * 2,
    depthMm: guide.depthMm + AR_ROOM.frontMarginMm + AR_ROOM.backMarginMm,
    heightMm: guide.heightMm + AR_ROOM.topMarginMm,
  };
}

// 左右の壁の枚数（奥の壁は両方の形にある）
const SIDE_WALLS: Record<RoomLayout, number> = { "three-walls": 2, "back-left": 1 };

/** 仮の部屋の外寸（mm）。幅と奥行は壁の外側まで、高さは床の下面から天井の上面まで */
export function roomOuterMm(nui: NuiDimensions, layout: RoomLayout) {
  const inner = roomInteriorMm(nui);
  return {
    widthMm: inner.widthMm + AR_ROOM.wallThicknessMm * SIDE_WALLS[layout],
    depthMm: inner.depthMm + AR_ROOM.wallThicknessMm,
    heightMm: AR_ROOM.floorThicknessMm + inner.heightMm + AR_ROOM.ceilingThicknessMm,
  };
}

function material(name: string, color: Rgba, doubleSided: boolean): ArMaterial {
  return { name, color, roughness: AR_MATERIALS.roughness, doubleSided };
}

const toMeters = (mm: Vec3): Vec3 => [mm[0] / MM_PER_M, mm[1] / MM_PER_M, mm[2] / MM_PER_M];

const box = (name: string, minMm: Vec3, maxMm: Vec3, m: ArMaterial) =>
  boxMesh(name, toMeters(minMm), toMeters(maxMm), m);

/**
 * 仮の部屋。床・壁・透明な天井と、ぬいの目安の箱を返す。
 * 床の下面が y=0、手前（+Z）が開いている面。
 * "back-left" は奥と左だけに壁があり、右と手前が開いている。
 */
export function buildRoomMeshes(nui: NuiDimensions, layout: RoomLayout): ArMesh[] {
  const guide = nuiGuideSizeMm(nui);
  const inner = roomInteriorMm(nui);
  const wall = AR_ROOM.wallThicknessMm;
  const floorTop = AR_ROOM.floorThicknessMm;
  const ceilingBottom = floorTop + inner.heightMm;
  const left = -inner.widthMm / 2 - wall;
  const right = layout === "three-walls" ? inner.widthMm / 2 + wall : inner.widthMm / 2;
  const back = -inner.depthMm / 2 - wall;
  const front = inner.depthMm / 2;

  const floorMaterial = material("floor", AR_MATERIALS.floor, false);
  const wallMaterial = material("wall", AR_MATERIALS.wall, false);
  const meshes: ArMesh[] = [
    box("floor", [left, 0, back], [right, floorTop, front], floorMaterial),
    box("wall-back", [left, floorTop, back], [right, ceilingBottom, back + wall], wallMaterial),
    box("wall-left", [left, floorTop, back + wall], [left + wall, ceilingBottom, front], wallMaterial),
  ];
  if (layout === "three-walls") {
    meshes.push(
      box("wall-right", [right - wall, floorTop, back + wall], [right, ceilingBottom, front], wallMaterial),
    );
  }

  const guideBack = -inner.depthMm / 2 + AR_ROOM.backMarginMm;
  meshes.push(
    box(
      "ceiling",
      [left, ceilingBottom, back],
      [right, ceilingBottom + AR_ROOM.ceilingThicknessMm, front],
      material("ceiling", AR_MATERIALS.ceiling, true),
    ),
    box(
      "nui-guide",
      [-guide.widthMm / 2, floorTop, guideBack],
      [guide.widthMm / 2, floorTop + guide.heightMm, guideBack + guide.depthMm],
      material("nui-guide", AR_MATERIALS.nuiGuide, true),
    ),
  );
  return meshes;
}

import { expect, test } from "vitest";
import { AR_ROOM } from "@/lib/ar/config";
import { boxMesh, type ArMesh } from "@/lib/ar/mesh";
import { buildRoomMeshes, nuiGuideSizeMm, roomInteriorMm, roomOuterMm } from "@/lib/ar/room";
import { effectiveNuiSize } from "@/lib/nuis/dimensions";

const nui = { heightMm: 170, sitHeightMm: 150, shoulderWidthMm: 100, hugWidthMm: 120 };
const MM_PER_M = 1000;

function extent(meshes: ArMesh | ArMesh[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of Array.isArray(meshes) ? meshes : [meshes]) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], mesh.positions[i + k] * MM_PER_M);
        max[k] = Math.max(max[k], mesh.positions[i + k] * MM_PER_M);
      }
    }
  }
  return { min, max };
}

const named = (meshes: ArMesh[], name: string) => meshes.find((mesh) => mesh.name === name)!;

test("the nui guide follows the fit judgment: hug width first, shoulder width as fallback", () => {
  expect(nuiGuideSizeMm(nui)).toEqual({ widthMm: 120, depthMm: 120, heightMm: 150 });
  expect(nuiGuideSizeMm({ ...nui, hugWidthMm: null })).toEqual({ widthMm: 100, depthMm: 100, heightMm: 150 });
});

test("a nui registered with its height only gets a guide estimated from the height", () => {
  const heightOnly = { heightMm: 170, sitHeightMm: null, shoulderWidthMm: null, hugWidthMm: null };
  const estimated = effectiveNuiSize(heightOnly);
  expect(nuiGuideSizeMm(heightOnly)).toEqual({
    widthMm: estimated.widthMm,
    depthMm: estimated.widthMm,
    heightMm: estimated.sitHeightMm,
  });
  expect(buildRoomMeshes(heightOnly, "back-left").map((mesh) => mesh.name)).toContain("nui-guide");
});

test("the room interior adds the configured margins around the guide", () => {
  expect(roomInteriorMm(nui)).toEqual({
    widthMm: 120 + AR_ROOM.sideMarginMm * 2,
    depthMm: 120 + AR_ROOM.frontMarginMm + AR_ROOM.backMarginMm,
    heightMm: 150 + AR_ROOM.topMarginMm,
  });
});

test("a three-wall room has back, left and right walls with the interior between them", () => {
  const meshes = buildRoomMeshes(nui, "three-walls");
  const inner = roomInteriorMm(nui);
  expect(meshes.map((mesh) => mesh.name)).toEqual([
    "floor", "wall-back", "wall-left", "wall-right", "ceiling", "nui-guide",
  ]);
  const whole = extent(meshes);
  expect(whole.min[1]).toBeCloseTo(0, 3);
  expect(whole.max[2]).toBeCloseTo(inner.depthMm / 2, 3);

  const left = extent(named(meshes, "wall-left"));
  const right = extent(named(meshes, "wall-right"));
  const back = extent(named(meshes, "wall-back"));
  expect(right.min[0] - left.max[0]).toBeCloseTo(inner.widthMm, 3);
  expect(left.max[1] - left.min[1]).toBeCloseTo(inner.heightMm, 3);
  expect(inner.depthMm / 2 - back.max[2]).toBeCloseTo(inner.depthMm, 3);
  // 手前（+Z）には壁がない
  expect(left.max[2]).toBeCloseTo(inner.depthMm / 2, 3);
});

test("a back-left room leaves the right side and the front open", () => {
  const meshes = buildRoomMeshes(nui, "back-left");
  const inner = roomInteriorMm(nui);
  expect(meshes.map((mesh) => mesh.name)).toEqual(["floor", "wall-back", "wall-left", "ceiling", "nui-guide"]);
  expect(extent(named(meshes, "floor")).max[0]).toBeCloseTo(inner.widthMm / 2, 3);
  expect(extent(named(meshes, "wall-left")).min[0]).toBeCloseTo(-inner.widthMm / 2 - AR_ROOM.wallThicknessMm, 3);
});

test("the reported outer size matches the generated meshes for both layouts", () => {
  for (const layout of ["three-walls", "back-left"] as const) {
    const whole = extent(buildRoomMeshes(nui, layout));
    const outer = roomOuterMm(nui, layout);
    expect(whole.max[0] - whole.min[0]).toBeCloseTo(outer.widthMm, 3);
    expect(whole.max[2] - whole.min[2]).toBeCloseTo(outer.depthMm, 3);
    expect(whole.max[1] - whole.min[1]).toBeCloseTo(outer.heightMm, 3);
  }
  expect(roomOuterMm(nui, "back-left")).toEqual({
    widthMm: 120 + AR_ROOM.sideMarginMm * 2 + AR_ROOM.wallThicknessMm,
    depthMm: 120 + AR_ROOM.frontMarginMm + AR_ROOM.backMarginMm + AR_ROOM.wallThicknessMm,
    heightMm: AR_ROOM.floorThicknessMm + 150 + AR_ROOM.topMarginMm + AR_ROOM.ceilingThicknessMm,
  });
});

test("the guide box stands on the floor and only the ceiling and guide are translucent", () => {
  const meshes = buildRoomMeshes(nui, "three-walls");
  const guide = extent(named(meshes, "nui-guide"));
  const back = extent(named(meshes, "wall-back"));
  expect(guide.min[1]).toBeCloseTo(AR_ROOM.floorThicknessMm, 3);
  expect(guide.max[1] - guide.min[1]).toBeCloseTo(nui.sitHeightMm, 3);
  expect(guide.max[0] - guide.min[0]).toBeCloseTo(nui.hugWidthMm, 3);
  expect(guide.min[2] - back.max[2]).toBeCloseTo(AR_ROOM.backMarginMm, 3);
  expect(meshes.filter((mesh) => mesh.material.color[3] < 1).map((mesh) => mesh.name)).toEqual([
    "ceiling", "nui-guide",
  ]);
});

test("box faces wind counter-clockwise around their outward normals", () => {
  const box = boxMesh("box", [-1, -2, -3], [1, 2, 3], {
    name: "m", color: [1, 1, 1, 1], roughness: 1, doubleSided: false,
  });
  const at = (i: number) => [box.positions[i * 3], box.positions[i * 3 + 1], box.positions[i * 3 + 2]];
  for (let t = 0; t < box.indices!.length; t += 3) {
    const [a, b, c] = [box.indices![t], box.indices![t + 1], box.indices![t + 2]].map(at);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const n = box.indices![t] * 3;
    const dot = cross[0] * box.normals[n] + cross[1] * box.normals[n + 1] + cross[2] * box.normals[n + 2];
    expect(dot).toBeGreaterThan(0);
  }
});

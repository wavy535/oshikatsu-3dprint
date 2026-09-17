import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { AR_ANCHOR, AR_BLEND, AR_LIMITS, AR_MATERIALS } from "@/lib/ar/config";
import { decimateToBudget } from "@/lib/ar/decimate";
import { ArInputError } from "@/lib/ar/errors";
import { meshSizeMm } from "@/lib/ar/mesh";
import {
  buildWorkMeshes,
  isUnconvertibleModelError,
  readBlendModel,
  readModelObjects,
  workModelExtension,
} from "@/lib/ar/work-model";
import { BlendParseError } from "@/lib/print/blend";
import { srgbHexToLinear } from "@/lib/print/color";
import { AnalysisBudget, ModelLimitError } from "@/lib/print/limits";
import type { NamedMesh } from "@/lib/print/mesh";
import { buildTestBlend, cubeMesh } from "./helpers/blend-files";
import {
  bambuStylePackage,
  basematerialsXml,
  modelXml,
  modelZip,
  tetrahedronMesh,
  tetrahedronMeshWith,
} from "./helpers/model-files";

// 色を持たないデータ（STL など）の形
const plain = (objects: NamedMesh[]) => ({ objects, materials: [] });

// Print coordinates in mm with Z up; every face winds outward.
const tetrahedron = {
  name: "tetrahedron",
  mesh: {
    positions: Float64Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
    indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
    materialIndices: null,
  },
};

function bounds(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}

test("print coordinates (mm, Z up) become AR coordinates (m, Y up) resting on the floor", () => {
  const { meshes, outputTriangles } = buildWorkMeshes(plain([tetrahedron]), 1);
  expect(outputTriangles).toBe(4);
  const b = bounds(meshes[0].positions);
  expect(b.min[1]).toBeCloseTo(0, 6);
  expect(b.max[1]).toBeCloseTo(0.01, 6);
  expect(b.min[0]).toBeCloseTo(-0.005, 6);
  expect(b.max[0]).toBeCloseTo(0.005, 6);
  expect(b.min[2]).toBeCloseTo(-0.005, 6);
  expect(b.max[2]).toBeCloseTo(0.005, 6);
});

test("the size variant ratio scales the converted model", () => {
  const b = bounds(buildWorkMeshes(plain([tetrahedron]), 4 / 3).meshes[0].positions);
  expect(b.max[1] - b.min[1]).toBeCloseTo((0.01 * 4) / 3, 6);
});

test("the room anchor puts the back-left bottom corner at the origin, and scaling keeps it there", () => {
  // 作品は底面の中心（上のテスト）、部屋と手元のファイルは角
  const corner = bounds(buildWorkMeshes(plain([tetrahedron]), 1, new AnalysisBudget(), AR_ANCHOR.room).meshes[0].positions);
  for (const value of corner.min) expect(value).toBeCloseTo(0, 6);
  for (const value of corner.max) expect(value).toBeCloseTo(0.01, 6);

  // 大きさを変えても基準点の角は動かない（拡大縮小の中心になる）
  const bigger = bounds(buildWorkMeshes(plain([tetrahedron]), 2, new AnalysisBudget(), AR_ANCHOR.room).meshes[0].positions);
  for (const value of bigger.min) expect(value).toBeCloseTo(0, 6);
  for (const value of bigger.max) expect(value).toBeCloseTo(0.02, 6);
});

test("flat normals are unit length and keep the outward orientation after the axis change", () => {
  const mesh = buildWorkMeshes(plain([tetrahedron]), 1).meshes[0];
  for (let i = 0; i < mesh.normals.length; i += 3) {
    expect(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])).toBeCloseTo(1, 5);
  }
  // The first face is the bottom (z = 0 in print), so it must face down in AR.
  expect(mesh.normals[1]).toBeCloseTo(-1, 5);
});

test("STL and multi-part 3MF files are read by extension and merged", () => {
  const stl = readFileSync(new URL("./fixtures/tetrahedron.stl", import.meta.url));
  expect(readModelObjects(stl, "model.STL", new AnalysisBudget()).objects).toHaveLength(1);

  const threeMf = modelZip(
    modelXml(
      `<object id="1">${tetrahedronMesh}</object>`,
      '<item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 30 0 0"/>',
    ),
  );
  const model = readModelObjects(threeMf, "room.3mf", new AnalysisBudget());
  expect(model.objects).toHaveLength(2);
  const { meshes, outputTriangles } = buildWorkMeshes(model, 1);
  expect(outputTriangles).toBe(8);
  const b = bounds(meshes[0].positions);
  expect(b.max[0] - b.min[0]).toBeCloseTo(0.04, 6);
  expect(() => readModelObjects(stl, "model.obj", new AnalysisBudget())).toThrow(ArInputError);
});

test("colored data becomes one mesh per color, with the same origin for every color", () => {
  const threeMf = modelZip(
    modelXml(
      basematerialsXml(1, [
        ["木", "#DAC3A0"],
        ["黒", "#101010"],
      ]) + `<object id="2" pid="1" pindex="0">${tetrahedronMeshWith([0, 0, 1, 1])}</object>`,
      '<item objectid="2"/>',
    ),
  );
  const model = readModelObjects(threeMf, "colored.3mf", new AnalysisBudget());
  const { meshes, outputTriangles } = buildWorkMeshes(model, 1);
  expect(outputTriangles).toBe(4);
  expect(meshes.map((mesh) => mesh.material.name)).toEqual(["木", "黒"]);
  expect(meshes.map((mesh) => mesh.positions.length / 9)).toEqual([2, 2]);
  // 色は sRGB からリニアに直して入れる（glTF・USDZ はリニア）
  expect(meshes[0].material.color).toEqual([...srgbHexToLinear("#DAC3A0")!, 1]);
  expect(meshes[1].material.color).toEqual([...srgbHexToLinear("#101010")!, 1]);

  // 色で分けても位置はずれない：全体の外形は色を持たないときと同じ
  const together = bounds([...meshes[0].positions, ...meshes[1].positions]);
  const single = bounds(buildWorkMeshes(plain(model.objects), 1).meshes[0].positions);
  for (const axis of [0, 1, 2]) {
    expect(together.min[axis]).toBeCloseTo(single.min[axis], 6);
    expect(together.max[axis]).toBeCloseTo(single.max[axis], 6);
  }
});

test("too many colors are merged into the plain work color", () => {
  const colors = Array.from({ length: AR_LIMITS.maxColorGroups + 2 }, (_, i) => [`色${i}`, "#102030"] as const);
  const objects = colors.map((_, i) => `<object id="${i + 2}" pid="1">${tetrahedronMeshWith(i, i * 20)}</object>`);
  const threeMf = modelZip(
    modelXml(
      basematerialsXml(1, colors) + objects.join(""),
      colors.map((_, i) => `<item objectid="${i + 2}"/>`).join(""),
    ),
  );
  const model = readModelObjects(threeMf, "many-colors.3mf", new AnalysisBudget());
  const { meshes } = buildWorkMeshes(model, 1);
  expect(meshes).toHaveLength(AR_LIMITS.maxColorGroups);
  // あふれた色は作品用の単色にまとめる
  expect(meshes.filter((mesh) => mesh.material.name === "work")).toHaveLength(1);
});

test("data without colors stays a single mesh in the plain work color", () => {
  const { meshes } = buildWorkMeshes(plain([tetrahedron]), 1);
  expect(meshes).toHaveLength(1);
  expect(meshes[0].name).toBe("work");
  expect(meshes[0].material.color).toEqual(AR_MATERIALS.work);
});

test("Bambu Studio files that keep the shape in another model file convert at their size", () => {
  const model = readModelObjects(bambuStylePackage(), "1_Chair_01.gcode.3mf", new AnalysisBudget());
  expect(model.objects).toHaveLength(1);
  const size = meshSizeMm(buildWorkMeshes(model, 1).meshes);
  expect(size.widthMm).toBeCloseTo(10, 3);
  expect(size.depthMm).toBeCloseTo(10, 3);
  expect(size.heightMm).toBeCloseTo(10, 3);
  expect(meshSizeMm([])).toEqual({ widthMm: 0, depthMm: 0, heightMm: 0 });
});

test("Blender files convert at the AR length of one unit, keep their layout, and can leave objects out", () => {
  const blend = buildTestBlend("current", [
    { name: "Floor", mesh: cubeMesh("Floor"), scale: [1, 1, 0.05] },
    { name: "Chair", mesh: cubeMesh("Chair"), loc: [0, 0, 1] },
  ]);
  const model = readModelObjects(blend, "roomfile/matsu_nuiroom.blend", new AnalysisBudget());
  expect(model.objects.map((object) => object.name)).toEqual(["Floor", "Chair"]);
  const size = meshSizeMm(buildWorkMeshes(model, 1).meshes);
  expect(size.widthMm).toBeCloseTo(2 * AR_BLEND.mmPerUnit, 3);
  expect(size.depthMm).toBeCloseTo(2 * AR_BLEND.mmPerUnit, 3);
  // From the bottom of the floor (z = -0.05) to the top of the chair (z = 2)
  expect(size.heightMm).toBeCloseTo(2.05 * AR_BLEND.mmPerUnit, 3);

  const { objects: floorOnly, report } = readBlendModel(blend, new AnalysisBudget(), { excludeObjects: ["Chair"] });
  expect(floorOnly.map((object) => object.name)).toEqual(["Floor"]);
  expect(report.objects).toEqual([
    { name: "Chair", excluded: true },
    { name: "Floor", excluded: false },
  ]);
  expect(
    readModelObjects(blend, "room.blend", new AnalysisBudget(), { excludeObjects: ["Chair"] }).objects,
  ).toHaveLength(1);
});

test("file extensions and conversion errors are classified for the AR routes", () => {
  expect(workModelExtension("1_Chair_01.GCODE.3MF")).toBe("3mf");
  expect(workModelExtension("part.stl")).toBe("stl");
  expect(workModelExtension("matsu_nuiroom.BLEND")).toBe("blend");
  expect(workModelExtension("notes.md")).toBeNull();
  expect(workModelExtension("room.blend1")).toBeNull();
  expect(workModelExtension("3mf")).toBeNull();
  expect(isUnconvertibleModelError(new ArInputError("bad size"))).toBe(true);
  expect(isUnconvertibleModelError(new ModelLimitError("too large"))).toBe(true);
  expect(isUnconvertibleModelError(new BlendParseError("not a blend file"))).toBe(true);
  expect(isUnconvertibleModelError(new Error("storage is down"))).toBe(false);
});

test("large meshes are decimated to the AR budget while keeping their overall size", () => {
  const quads = 160;
  const side = quads + 1;
  const positions = new Float64Array(side * side * 3);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = (j * side + i) * 3;
      positions[v] = i;
      positions[v + 1] = j;
      positions[v + 2] = 5 * Math.sin(i / 10) * Math.cos(j / 10);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      const a = j * side + i;
      indices.push(a, a + 1, a + side + 1, a, a + side + 1, a + side);
    }
  }
  expect(indices.length / 3).toBeGreaterThan(AR_LIMITS.workTriangleBudget);

  const result = decimateToBudget({ positions, indices: Uint32Array.from(indices) }, AR_LIMITS.workTriangleBudget);
  const triangles = result.indices.length / 3;
  expect(triangles).toBeLessThanOrEqual(AR_LIMITS.workTriangleBudget);
  // The search keeps the finest grid that fits, not the coarsest one.
  expect(triangles).toBeGreaterThan(AR_LIMITS.workTriangleBudget / 2);
  expect(result.resolution).not.toBeNull();

  const cell = quads / result.resolution!;
  const b = bounds(result.positions);
  expect(b.min[0]).toBeLessThanOrEqual(cell);
  expect(b.max[0]).toBeGreaterThanOrEqual(quads - cell);
  for (let t = 0; t < result.indices.length; t += 3) {
    const [a, c, d] = [result.indices[t], result.indices[t + 1], result.indices[t + 2]];
    expect(a !== c && c !== d && a !== d).toBe(true);
  }
});

test("meshes within the budget are left unchanged", () => {
  const result = decimateToBudget(tetrahedron.mesh, AR_LIMITS.workTriangleBudget);
  expect(result.resolution).toBeNull();
  expect(result.indices).toBe(tetrahedron.mesh.indices);
});

test("invalid scale ratios and zero-size shapes are rejected", () => {
  expect(() => buildWorkMeshes(plain([tetrahedron]), 0)).toThrow(ArInputError);
  expect(() => buildWorkMeshes(plain([tetrahedron]), Number.NaN)).toThrow(ArInputError);
  expect(() => buildWorkMeshes(plain([]), 1)).toThrow(ArInputError);
  const collapsed = { positions: new Float64Array(12), indices: tetrahedron.mesh.indices };
  expect(() => decimateToBudget(collapsed, 1)).toThrow(ArInputError);
});

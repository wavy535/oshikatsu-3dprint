import { zstdCompressSync } from "node:zlib";
import { expect, test } from "vitest";
import { BlendParseError, parseBlend, type BlendReadOptions } from "@/lib/print/blend";
import { BlendFile } from "@/lib/print/blend-file";
import { linearToSrgbHex } from "@/lib/print/color";
import { AnalysisBudget, MODEL_LIMITS, ModelLimitError } from "@/lib/print/limits";
import { boundsOf, type NamedMesh } from "@/lib/print/mesh";
import { buildTestBlend, cubeMesh, gzipBlend, seekableZstd } from "./helpers/blend-files";

// 1 unit = 100 mm, as the room files are made; the cube is 2 units across.
const OPTIONS: BlendReadOptions = { mmPerUnit: 100, maxSubdivisionLevels: 3 };
const FORMATS = ["legacy", "current"] as const;
const CUBE_VOLUME_MM3 = 8 * 100 ** 3;
const SEEK_FOOTER_BYTES = 9;
const SEEK_ENTRY_BYTES = 8;
const SEEK_ENTRY_DECOMPRESSED_OFFSET = 4;
// Blender's DNA_object_types.h
const ROT_MODE_QUAT = 0;
const ROT_MODE_ZYX = 6;
const ROT_MODE_AXIS_ANGLE = -1;
const PARBONE = 7;
// "BLENDER-v404": pointer size at 7, endianness at 8; "BLENDER17-01v0500": block header format at 10-11
const LEGACY_POINTER_MARK = 7;
const LEGACY_ENDIAN_MARK = 8;
const LARGE_HEADER_FORMAT = 10;
const LEGACY_BHEAD_BYTES = 24;

const read = (buf: Buffer, options: Partial<BlendReadOptions> = {}) => parseBlend(buf, { ...OPTIONS, ...options });
const byName = (objects: NamedMesh[], name: string) => objects.find((object) => object.name === name)!;
const vertex = ({ mesh }: NamedMesh, index: number) => [...mesh.positions.subarray(index * 3, index * 3 + 3)];
const triangles = ({ mesh }: NamedMesh) => mesh.indices.length / 3;

function expectClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, k) => expect(actual[k]).toBeCloseTo(value, 3));
}

function expectBounds(object: NamedMesh, min: readonly number[], max: readonly number[]) {
  const bounds = boundsOf(object.mesh);
  expectClose(bounds.min, min);
  expectClose(bounds.max, max);
}

// Positive when the triangles wind outward
function signedVolume({ mesh }: NamedMesh) {
  const p = mesh.positions;
  let volume = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
    volume +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return volume / 6;
}

test.each(FORMATS)("render meshes come out in world coordinates in mm (%s file)", (format) => {
  const buf = buildTestBlend(format, [
    { name: "Cube", mesh: cubeMesh(), loc: [1, 2, 3], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.5] },
  ]);
  const { objects, report } = read(buf);
  expect(objects.map((object) => object.name)).toEqual(["Cube"]);
  expect(triangles(objects[0])).toBe(12);
  expectBounds(objects[0], [0, 100, 250], [200, 300, 350]);
  // Vertex 1 (1, -1, -1): scaled to z = -0.5, turned a quarter about Z to (1, 1), then moved
  expectClose(vertex(objects[0], 1), [200, 300, 250]);
  expect(signedVolume(objects[0])).toBeCloseTo(CUBE_VOLUME_MM3 / 2, 0);
  expect(report).toEqual({ objects: [{ name: "Cube", excluded: false }], hiddenObjects: 0, modifierNotes: [] });
});

test("zstd files (seekable as Blender saves them, or a single frame) and gzip files read like uncompressed ones", () => {
  const plain = buildTestBlend("current", [{ name: "Cube", mesh: cubeMesh(), loc: [1, 0, 0] }]);
  const expected = read(plain).objects[0].mesh.positions;
  const seekable = seekableZstd(plain, 256);
  expect(seekable.readUInt32LE(seekable.length - SEEK_FOOTER_BYTES)).toBeGreaterThan(1);
  for (const packed of [seekable, zstdCompressSync(plain), gzipBlend(plain)]) {
    expect(read(packed).objects[0].mesh.positions).toEqual(expected);
  }
});

test("pointers to DATA blocks resolve within their own ID, as Blender 5.0 reuses the addresses", () => {
  const cube = cubeMesh("Big");
  const small = { name: "Small", positions: cube.positions.map((value) => value / 2), faces: cube.faces };
  const buf = buildTestBlend("current", [
    { name: "A", mesh: cube, modifiers: [{ kind: "bevel" }] },
    { name: "B", mesh: small, modifiers: [{ kind: "collision" }] },
  ]);
  const addresses = new BlendFile(buf, new AnalysisBudget()).blocks
    .filter((block) => block.code === "DATA")
    .map((block) => block.address);
  expect(new Set(addresses).size).toBeLessThan(addresses.length);

  const { objects, report } = read(buf);
  expectBounds(byName(objects, "A"), [-100, -100, -100], [100, 100, 100]);
  expectBounds(byName(objects, "B"), [-50, -50, -50], [50, 50, 50]);
  // Bevel changes the shape but is not reproduced; Collision does not change it
  expect(report.modifierNotes).toEqual([{ object: "A", modifier: "Bevel", note: "unsupported" }]);
});

test.each(FORMATS)("objects hidden from renders are counted, and excluded objects stay listed (%s file)", (format) => {
  const buf = buildTestBlend(format, [
    { name: "Chair.10", mesh: cubeMesh() },
    { name: "Chair.2", mesh: cubeMesh(), loc: [3, 0, 0] },
    { name: "Hidden", mesh: cubeMesh(), hiddenInRender: true },
    { name: "Disabled", mesh: cubeMesh(), enabledInViewLayer: false },
  ]);
  const all = read(buf);
  expect(all.objects.map((object) => object.name)).toEqual(["Chair.10", "Chair.2"]);
  expect(all.report.objects).toEqual([
    { name: "Chair.2", excluded: false },
    { name: "Chair.10", excluded: false },
  ]);
  expect(all.report.hiddenObjects).toBe(2);

  const some = read(buf, { excludeObjects: ["Chair.10", "Hidden", "Unknown"] });
  expect(some.objects.map((object) => object.name)).toEqual(["Chair.2"]);
  expect(some.report.objects).toEqual([
    { name: "Chair.2", excluded: false },
    { name: "Chair.10", excluded: true },
  ]);
  expect(some.report.hiddenObjects).toBe(2);
  expect(() => read(buf, { excludeObjects: ["Chair.2", "Chair.10"] })).toThrow(BlendParseError);
});

test("Subdivision Surface uses its render levels, capped, on the limit surface unless it is recursive", () => {
  const buf = buildTestBlend("current", [
    { name: "Limit", mesh: cubeMesh(), modifiers: [{ kind: "subsurf", renderLevels: 1 }] },
    { name: "Recursive", mesh: cubeMesh(), modifiers: [{ kind: "subsurf", renderLevels: 1, recursive: true }] },
    { name: "Capped", mesh: cubeMesh(), modifiers: [{ kind: "subsurf", renderLevels: 5 }] },
    { name: "ViewportOnly", mesh: cubeMesh(), modifiers: [{ kind: "subsurf", renderLevels: 2, render: false }] },
    { name: "Simple", mesh: cubeMesh(), modifiers: [{ kind: "subsurf", renderLevels: 2, simple: true }] },
  ]);
  const { objects, report } = read(buf, { maxSubdivisionLevels: 2 });
  expect(triangles(byName(objects, "Limit"))).toBe(6 * 4 * 2);
  expect(triangles(byName(objects, "Recursive"))).toBe(6 * 4 * 2);
  expect(triangles(byName(objects, "Capped"))).toBe(6 * 4 ** 2 * 2);
  expect(triangles(byName(objects, "ViewportOnly"))).toBe(12);
  expect(triangles(byName(objects, "Simple"))).toBe(12);
  // The face centre (0, 0, 1) lies on the limit surface at z = 68/81; one recursive step leaves it at z = 1
  expect(boundsOf(byName(objects, "Limit").mesh).max[2]).toBeCloseTo((100 * 68) / 81, 9);
  expect(boundsOf(byName(objects, "Recursive").mesh).max[2]).toBeCloseTo(100, 9);
  expect(report.modifierNotes).toEqual([{ object: "Capped", modifier: "Subsurf", note: "levels_limited" }]);
});

test("material colours come from the Principled BSDF base colour, per face", () => {
  const wood = { name: "Wood_Top", baseColor: [0.7, 0.545, 0.35] };
  const black = { name: "Trim_Black", baseColor: [0.055, 0.052, 0.06] };
  // 上面が木、それ以外が黒。スロット2は使わない
  const cube = { ...cubeMesh("Table"), materials: [wood, black, null], faceMaterials: [1, 0, 1, 1, 1, 1] };
  const { objects, materials } = read(buildTestBlend("current", [{ name: "Table", mesh: cube }]));
  // 色の一覧は、材質スロットの順に最初に出てきたものから並ぶ
  expect(materials).toEqual([
    { name: "Wood_Top", hex: "#DAC3A0" },
    { name: "Trim_Black", hex: "#424045" },
  ]);
  // 立方体の面はどれも四角形なので、1面あたり三角形2つに同じ色が付く
  expect([...objects[0].mesh.materialIndices!]).toEqual([1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
});

test.each(FORMATS)("colours survive both storage formats, and unreadable ones fall back (%s file)", (format) => {
  const textured = { name: "Textured", baseColor: [1, 0, 0], baseColorLinked: true, viewportColor: [0.25, 0.5, 0.75] };
  const plain = { name: "Plain", viewportColor: [1, 1, 1] };
  const cube = { ...cubeMesh("Mixed"), materials: [textured, plain], faceMaterials: [0, 1, 0, 1, 0, 1] };
  const { objects, materials } = read(buildTestBlend(format, [{ name: "Mixed", mesh: cube }]));
  // 基本色にテクスチャがつながっているマテリアルは、ビューポートの表示色に落とす
  expect(materials).toEqual([
    { name: "Textured", hex: linearToSrgbHex([0.25, 0.5, 0.75]) },
    { name: "Plain", hex: "#FFFFFF" },
  ]);
  expect([...objects[0].mesh.materialIndices!]).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
});

test("materials shared between objects are listed once, and objects without one have no colour", () => {
  const paint = { name: "Paint", baseColor: [1, 1, 1] };
  const painted = { ...cubeMesh("Painted"), materials: [paint] };
  const bare = cubeMesh("Bare");
  const { objects, materials } = read(
    buildTestBlend("current", [
      { name: "A", mesh: painted },
      { name: "B", mesh: painted, loc: [5, 0, 0] },
      { name: "C", mesh: bare, loc: [10, 0, 0] },
    ]),
  );
  expect(materials).toEqual([{ name: "Paint", hex: "#FFFFFF" }]);
  expect(byName(objects, "A").mesh.materialIndices).not.toBeNull();
  expect(byName(objects, "B").mesh.materialIndices).not.toBeNull();
  expect(byName(objects, "C").mesh.materialIndices).toBeNull();
});

test("subdivision keeps the colour of the face it came from", () => {
  const two = { name: "Two", baseColor: [0, 0, 0] };
  const one = { name: "One", baseColor: [1, 1, 1] };
  const cube = { ...cubeMesh("Smooth"), materials: [one, two], faceMaterials: [0, 1, 1, 1, 1, 1] };
  const { objects } = read(
    buildTestBlend("current", [{ name: "Smooth", mesh: cube, modifiers: [{ kind: "subsurf", renderLevels: 1 }] }]),
  );
  const colors = [...objects[0].mesh.materialIndices!];
  // 1段の分割で1面が4つの四角形（=8三角形）になるので、色の数もその倍
  expect(colors).toHaveLength(6 * 4 * 2);
  // 1面だけスロット0（One）、残り5面はスロット1（Two）
  expect(colors.filter((color) => color === 0)).toHaveLength(4 * 2);
  expect(colors.filter((color) => color === 1)).toHaveLength(5 * 4 * 2);
});

test("objects sharing a mesh are placed separately, and a modifier on one leaves the other as it is", () => {
  const shared = cubeMesh("Shared");
  const buf = buildTestBlend("legacy", [
    { name: "Smooth", mesh: shared, modifiers: [{ kind: "subsurf", renderLevels: 1 }] },
    { name: "Plain", mesh: shared, loc: [5, 0, 0] },
  ]);
  const { objects } = read(buf);
  expect(triangles(byName(objects, "Smooth"))).toBe(48);
  expect(triangles(byName(objects, "Plain"))).toBe(12);
  expectBounds(byName(objects, "Plain"), [400, -100, -100], [600, 100, 100]);
});

test("Euler orders, quaternions and axis-angle rotations follow Blender", () => {
  const quarter = Math.PI / 2;
  const buf = buildTestBlend("current", [
    { name: "XYZ", mesh: cubeMesh(), rot: [quarter, 0, quarter] },
    { name: "ZYX", mesh: cubeMesh(), rot: [quarter, 0, quarter], rotmode: ROT_MODE_ZYX },
    { name: "Quaternion", mesh: cubeMesh(), rotmode: ROT_MODE_QUAT, quat: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
    { name: "AxisAngle", mesh: cubeMesh(), rotmode: ROT_MODE_AXIS_ANGLE, axisAngle: [0, 0, 2, quarter] },
  ]);
  const { objects } = read(buf);
  // Vertex 1 is (1, -1, -1). "XYZ" turns about X first and Z last; "ZYX" the other way round.
  expectClose(vertex(byName(objects, "XYZ"), 1), [-100, 100, -100]);
  expectClose(vertex(byName(objects, "ZYX"), 1), [100, 100, 100]);
  // A quarter turn about Z
  expectClose(vertex(byName(objects, "Quaternion"), 1), [100, 100, -100]);
  expectClose(vertex(byName(objects, "AxisAngle"), 1), [100, 100, -100]);
});

test("mirrored objects keep outward faces, and children follow their parent through the parent inverse", () => {
  // Column-major 4x4: the inverse of the parent's transform (scale 2, then move 10 along X)
  const parentInverse = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, -5, 0, 0, 1];
  const buf = buildTestBlend("legacy", [
    { name: "Mirrored", mesh: cubeMesh(), scale: [-1, 1, 1] },
    { name: "Parent", mesh: cubeMesh(), loc: [10, 0, 0], scale: [2, 2, 2] },
    { name: "Kept", mesh: cubeMesh(), loc: [0, 1, 0], parent: "Parent", parentinv: parentInverse },
    { name: "Follows", mesh: cubeMesh(), loc: [0, 1, 0], parent: "Parent" },
  ]);
  const { objects } = read(buf);
  expect(signedVolume(byName(objects, "Mirrored"))).toBeCloseTo(CUBE_VOLUME_MM3, 0);
  expectBounds(byName(objects, "Kept"), [-100, 0, -100], [100, 200, 100]);
  expectBounds(byName(objects, "Follows"), [800, 0, -200], [1200, 400, 200]);
  expect(signedVolume(byName(objects, "Follows"))).toBeCloseTo(CUBE_VOLUME_MM3 * 8, 0);
});

test("parents other than objects (bones, vertices) and broken meshes are rejected", () => {
  const boneParent = buildTestBlend("current", [
    { name: "Arm", mesh: cubeMesh() },
    { name: "Hand", mesh: cubeMesh(), parent: "Arm", partype: PARBONE },
  ]);
  expect(() => read(boneParent)).toThrow(/Hand.*親子付けの種類/);

  const withFaces = (faces: number[][]) =>
    buildTestBlend("legacy", [{ name: "Bad", mesh: { name: "Bad", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces } }]);
  expect(() => read(withFaces([[0, 1, 9]]))).toThrow(/頂点番号が不正/);
  expect(() => read(withFaces([[0, 1]]))).toThrow(/角が3つ未満/);
});

test("files other than 64-bit little-endian .blend files, and cut files, are rejected with the reason", () => {
  const legacy = buildTestBlend("legacy", [{ name: "Cube", mesh: cubeMesh() }]);
  const current = buildTestBlend("current", [{ name: "Cube", mesh: cubeMesh() }]);
  const withText = (buf: Buffer, at: number, text: string) => {
    const copy = Buffer.from(buf);
    copy.write(text, at, "latin1");
    return copy;
  };
  const cases: [Buffer, RegExp][] = [
    [Buffer.from("this is not a blend file"), /Blender のファイル/],
    [withText(legacy, LEGACY_POINTER_MARK, "_"), /32bit/],
    [withText(legacy, LEGACY_ENDIAN_MARK, "V"), /ビッグエンディアン/],
    [withText(current, LARGE_HEADER_FORMAT, "02"), /ヘッダ/],
    // without the end block (a header only), or cut inside the block before it
    [legacy.subarray(0, legacy.length - LEGACY_BHEAD_BYTES), /途中で切れて/],
    [legacy.subarray(0, legacy.length - LEGACY_BHEAD_BYTES - 1), /範囲が不正/],
  ];
  for (const [buf, reason] of cases) {
    expect(() => read(buf)).toThrow(BlendParseError);
    expect(() => read(buf)).toThrow(reason);
  }
});

test("broken compressed data is rejected, and oversized data is refused before it is expanded", () => {
  const plain = buildTestBlend("current", [{ name: "Cube", mesh: cubeMesh() }]);
  const garbage = Buffer.concat([zstdCompressSync(plain).subarray(0, 4), Buffer.from("not a zstd frame")]);
  expect(() => read(garbage)).toThrow(BlendParseError);

  const oversized = seekableZstd(plain, 256);
  const frames = oversized.readUInt32LE(oversized.length - SEEK_FOOTER_BYTES);
  const firstEntry = oversized.length - SEEK_FOOTER_BYTES - frames * SEEK_ENTRY_BYTES;
  oversized.writeUInt32LE(MODEL_LIMITS.blendBytes + 1, firstEntry + SEEK_ENTRY_DECOMPRESSED_OFFSET);
  expect(() => read(oversized)).toThrow(ModelLimitError);
});

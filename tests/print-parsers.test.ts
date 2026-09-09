import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseThreeMf } from "@/lib/print/threemf";
import { parseStl } from "@/lib/print/stl";
import { analyzeModelFile } from "@/lib/print";
import { extractZipFile, listZipEntries } from "@/lib/print/zip";
import { MODEL_LIMITS, ModelLimitError } from "@/lib/print/limits";
import { modelZip, modelXml, tetrahedronMesh } from "./helpers/model-files";

function changeDirectory(buf: Buffer, offset: number, value: number) {
  const directory = buf.readUInt32LE(buf.length - 6);
  buf.writeUInt32LE(value, directory + offset);
  return buf;
}

test.each([true, false])(
  "3MF round-trips a complete ZIP (compressed: %s)",
  (compressed) => {
    const xml = modelXml();
    const zip = modelZip(xml, compressed);
    expect(extractZipFile(zip, "3D/3dmodel.model")?.toString()).toBe(xml);
    const result = analyzeModelFile(zip, { fileName: "tetrahedron.3mf" });
    expect(result.triangleCount).toBe(4);
    expect(result.objects[0].isManifold).toBe(true);
    expect(result.totalVolumeCm3).toBeCloseTo(1 / 6, 2);
  },
);

test("3MF accepts quoted attributes, units and build transforms", () => {
  const xml = modelXml(
    undefined,
    '<item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0"/>',
  )
    .replace('unit="millimeter"', 'unit="centimeter"')
    .replaceAll('="', " = '")
    .replaceAll('"', "'");
  const doc = parseThreeMf(modelZip(xml));
  expect(doc.objects).toHaveLength(2);
  expect(doc.objects[0].mesh.positions[3]).toBe(100);
  expect(doc.objects[1].mesh.positions[0]).toBe(50);
});

test("ZIP output limits use actual bytes as well as declared size", () => {
  const tiny = modelZip("abc");
  expect(() =>
    extractZipFile(
      changeDirectory(tiny, 24, MODEL_LIMITS.xmlBytes + 1),
      "3D/3dmodel.model",
    ),
  ).toThrow(ModelLimitError);
  const falseSize = modelZip("x".repeat(1024 * 1024));
  expect(() =>
    extractZipFile(changeDirectory(falseSize, 24, 10), "3D/3dmodel.model"),
  ).toThrow(/展開サイズ/);
});

test("ZIP rejects corrupt checksums, truncated data and multi-disk archives", () => {
  expect(() =>
    extractZipFile(changeDirectory(modelZip("abc"), 16, 0), "3D/3dmodel.model"),
  ).toThrow(/チェックサム/);
  expect(() =>
    extractZipFile(
      changeDirectory(modelZip("abc"), 20, 1_000_000),
      "3D/3dmodel.model",
    ),
  ).toThrow(/範囲/);
  const split = modelZip("abc");
  split.writeUInt16LE(1, split.length - 18);
  expect(() => listZipEntries(split)).toThrow(/分割/);
  const missing = modelZip("abc").subarray(0, 40);
  expect(() => listZipEntries(missing)).toThrow(/終端/);
});

test("ZIP64 and excessive directory entries fail before extraction", () => {
  expect(() =>
    listZipEntries(changeDirectory(modelZip("abc"), 24, 0xffffffff)),
  ).toThrow(/ZIP64/);
  const many = modelZip("abc");
  many.writeUInt16LE(MODEL_LIMITS.zipEntries + 1, many.length - 14);
  many.writeUInt16LE(MODEL_LIMITS.zipEntries + 1, many.length - 12);
  expect(() => listZipEntries(many)).toThrow(ModelLimitError);
});

test.each(["-1", "0.5", "99"])(
  "invalid triangle index %s is not silently converted",
  (value) => {
    const xml = modelXml().replace('v1="0"', `v1="${value}"`);
    expect(() => parseThreeMf(modelZip(xml))).toThrow(/頂点参照/);
  },
);

test("STL rejects non-finite coordinates and too many triangles before allocation", () => {
  const stl = readFileSync(
    new URL("./fixtures/tetrahedron.stl", import.meta.url),
  );
  expect(() =>
    parseStl(Buffer.from(stl.toString().replace("vertex 10", "vertex 1e999"))),
  ).toThrow(/座標/);
  const oversized = Buffer.alloc(84 + (MODEL_LIMITS.triangles + 1) * 50);
  oversized.writeUInt32LE(MODEL_LIMITS.triangles + 1, 80);
  expect(() => parseStl(oversized)).toThrow(ModelLimitError);
  const binary = Buffer.alloc(134);
  binary.writeUInt32LE(1, 80);
  binary.writeFloatLE(Infinity, 96);
  expect(() => parseStl(binary)).toThrow(/座標/);
});

describe("3MF component expansion", () => {
  test("cycles and missing objects fail instead of dropping parts", () => {
    const cyclic =
      '<object id="1"><components><component objectid="1"/></components></object>';
    expect(() => parseThreeMf(modelZip(modelXml(cyclic)))).toThrow(/循環/);
    expect(() =>
      parseThreeMf(modelZip(modelXml(undefined, '<item objectid="9"/>'))),
    ).toThrow(/存在しない/);
  });
  test("counts every built instance before copying transformed meshes", () => {
    const build = '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>';
    expect(
      parseThreeMf(modelZip(modelXml(undefined, build.repeat(128)))).objects,
    ).toHaveLength(128);
    expect(() =>
      parseThreeMf(modelZip(modelXml(undefined, build.repeat(129)))),
    ).toThrow(ModelLimitError);
  });
  test("the triangle limit covers all resource meshes, not each one independently", () => {
    const triangles = '<triangle v1="0" v2="2" v3="1"/>'.repeat(
      MODEL_LIMITS.triangles / 2 + 1,
    );
    const mesh = tetrahedronMesh.replace(
      /<triangles>[\s\S]*<\/triangles>/,
      `<triangles>${triangles}</triangles>`,
    );
    expect(() =>
      parseThreeMf(
        modelZip(
          modelXml(
            `<object id="1">${mesh}</object><object id="2">${mesh}</object>`,
          ),
        ),
      ),
    ).toThrow(ModelLimitError);
  });
  test("unknown units and malformed transforms fail instead of guessing dimensions", () => {
    expect(() =>
      parseThreeMf(modelZip(modelXml().replace("millimeter", "unknown"))),
    ).toThrow(/単位/);
    expect(() =>
      parseThreeMf(
        modelZip(modelXml(undefined, '<item objectid="1" transform="1 2 3"/>')),
      ),
    ).toThrow(/変換行列/);
  });
});

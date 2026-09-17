import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseThreeMf } from "@/lib/print/threemf";
import { parseStl } from "@/lib/print/stl";
import { analyzeModelFile } from "@/lib/print";
import { extractZipFile, listZipEntries } from "@/lib/print/zip";
import { MODEL_LIMITS, ModelLimitError } from "@/lib/print/limits";
import {
  PRODUCTION_NAMESPACE,
  bambuStylePackage,
  modelPackage,
  modelZip,
  modelXml,
  productionModelXml,
  tetrahedronMesh,
} from "./helpers/model-files";

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

describe("3MF production extension (p:path)", () => {
  const referencing = (id: string, path: string, objectid = "1") =>
    `<object id="${id}"><components><component p:path="${path}" objectid="${objectid}"/></components></object>`;
  const objectFile = (resources = `<object id="1">${tetrahedronMesh}</object>`, unit = "millimeter") =>
    productionModelXml(resources, "", PRODUCTION_NAMESPACE, unit);

  test("components that point into another model file are expanded with both transforms", () => {
    const pkg = bambuStylePackage({
      componentTransform: "1 0 0 0 1 0 0 0 1 0 0 5",
      itemTransform: "1 0 0 0 1 0 0 0 1 100 0 0",
    });
    const doc = parseThreeMf(pkg);
    expect(doc.objects).toHaveLength(1);
    // The vertex (10, 0, 0) moves by the component (z + 5), then by the build item (x + 100).
    expect([...doc.objects[0].mesh.positions.subarray(3, 6)]).toEqual([110, 0, 5]);
    const analysis = analyzeModelFile(pkg, { fileName: "1_Chair_01.gcode.3mf" });
    expect(analysis.triangleCount).toBe(4);
    expect(analysis.objects[0].isManifold).toBe(true);
  });

  test("build items may point into another model file, and paths ignore case", () => {
    const pkg = modelPackage({
      "3D/3dmodel.model": productionModelXml(
        "",
        '<item objectid="7" p:path="/3d/objects/PART.model"/>',
      ),
      "3D/Objects/part.model": objectFile(`<object id="7">${tetrahedronMesh}</object>`),
    });
    expect(parseThreeMf(pkg).objects).toHaveLength(1);
  });

  test("the prefix of the production namespace is taken from its declaration", () => {
    const namespace =
      'xmlns:prod="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';
    const pkg = modelPackage({
      "3D/3dmodel.model": productionModelXml(
        referencing("2", "/3D/Objects/a.model").replace("p:path", "prod:path"),
        '<item objectid="2"/>',
        namespace,
      ),
      "3D/Objects/a.model": productionModelXml(
        `<object id="1">${tetrahedronMesh}</object>`,
        "",
        namespace,
      ),
    });
    expect(parseThreeMf(pkg).objects).toHaveLength(1);
  });

  test("missing model files, missing objects and references from non-root files fail", () => {
    const root = (resources: string) =>
      productionModelXml(resources, '<item objectid="2"/>');
    expect(() =>
      parseThreeMf(
        modelPackage({ "3D/3dmodel.model": root(referencing("2", "/3D/Objects/missing.model")) }),
      ),
    ).toThrow(/参照しているモデル/);
    expect(() =>
      parseThreeMf(
        modelPackage({
          "3D/3dmodel.model": root(referencing("2", "/3D/Objects/a.model", "9")),
          "3D/Objects/a.model": objectFile(),
        }),
      ),
    ).toThrow(/存在しない/);
    expect(() =>
      parseThreeMf(
        modelPackage({
          "3D/3dmodel.model": root(referencing("2", "/3D/Objects/a.model")),
          "3D/Objects/a.model": objectFile(
            `<object id="1">${tetrahedronMesh}</object>${referencing("3", "/3D/Objects/b.model")}`,
          ),
          "3D/Objects/b.model": objectFile(),
        }),
      ),
    ).toThrow(/さらに別のファイル/);
  });

  test("each model file converts its own unit, and colors stay within the file that defines them", () => {
    const pkg = modelPackage({
      "3D/3dmodel.model": productionModelXml(
        '<basematerials id="5"><base name="blue" displaycolor="#0000FF"/></basematerials>' +
          referencing("2", "/3D/Objects/a.model"),
        '<item objectid="2"/>',
      ),
      "3D/Objects/a.model": objectFile(
        '<basematerials id="5"><base name="red" displaycolor="#FF0000"/></basematerials>' +
          `<object id="1" pid="5" pindex="0">${tetrahedronMesh}</object>`,
        "centimeter",
      ),
    });
    const doc = parseThreeMf(pkg);
    expect(doc.declaredUnit).toBe("millimeter");
    expect(doc.objects[0].mesh.positions[3]).toBe(100);
    expect(doc.materials.map((m) => [m.name, m.faceCount])).toEqual([
      ["blue", 0],
      ["red", 4],
    ]);
  });

  test("the triangle limit adds up the meshes of every model file", () => {
    const triangles = '<triangle v1="0" v2="2" v3="1"/>'.repeat(
      MODEL_LIMITS.triangles / 2 + 1,
    );
    const mesh = tetrahedronMesh.replace(
      /<triangles>[\s\S]*<\/triangles>/,
      `<triangles>${triangles}</triangles>`,
    );
    const pkg = modelPackage({
      "3D/3dmodel.model": productionModelXml(
        referencing("2", "/3D/Objects/a.model") + referencing("3", "/3D/Objects/b.model"),
        '<item objectid="2"/><item objectid="3"/>',
      ),
      "3D/Objects/a.model": objectFile(`<object id="1">${mesh}</object>`),
      "3D/Objects/b.model": objectFile(`<object id="1">${mesh}</object>`),
    });
    expect(() => parseThreeMf(pkg)).toThrow(ModelLimitError);
  });

  test("the expanded XML limit covers every model file together", () => {
    const rootXml = productionModelXml(
      referencing("2", "/3D/Objects/a.model"),
      '<item objectid="2"/>',
    );
    const pkg = modelPackage({
      "3D/3dmodel.model": rootXml,
      "3D/Objects/a.model": objectFile(),
    });
    // Declare the second file one byte larger than what the root model leaves of the limit.
    const directory = pkg.readUInt32LE(pkg.length - 6);
    const second = directory + 46 + Buffer.byteLength("3D/3dmodel.model");
    pkg.writeUInt32LE(MODEL_LIMITS.xmlBytes - Buffer.byteLength(rootXml) + 1, second + 24);
    expect(() => parseThreeMf(pkg)).toThrow(ModelLimitError);
  });
});

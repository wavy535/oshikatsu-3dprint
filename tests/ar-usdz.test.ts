import { crc32 } from "node:zlib";
import { expect, test } from "vitest";
import { boxMesh, type ArMaterial } from "@/lib/ar/mesh";
import { buildRoomMeshes } from "@/lib/ar/room";
import { buildUsda, encodeUsdz } from "@/lib/ar/usdz";
import { extractZipFile } from "@/lib/print/zip";

const nui = { sitHeightMm: 150, shoulderWidthMm: 100, hugWidthMm: 120 };
const glass: ArMaterial = { name: "glass", color: [0.5, 0.25, 1, 0.2], roughness: 0.5, doubleSided: true };

// Reads the first local file header independently from the production writer.
function firstEntry(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  return {
    signature: view.getUint32(0, true),
    method: view.getUint16(8, true),
    crc: view.getUint32(14, true),
    size: view.getUint32(18, true),
    name: new TextDecoder().decode(bytes.subarray(30, 30 + nameLength)),
    dataOffset: 30 + nameLength + extraLength,
  };
}

test("USDZ is an uncompressed zip whose root layer starts on a 64-byte boundary", () => {
  const bytes = encodeUsdz(buildRoomMeshes(nui, "three-walls"));
  const entry = firstEntry(bytes);
  expect(entry.signature).toBe(0x04034b50);
  expect(entry.method).toBe(0);
  expect(entry.name).toBe("model.usda");
  expect(entry.dataOffset % 64).toBe(0);
  const data = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.size);
  expect(entry.crc).toBe(crc32(data));
  expect(new TextDecoder().decode(data).startsWith("#usda 1.0")).toBe(true);
});

test("the package can be read back by the project's zip reader", () => {
  const meshes = buildRoomMeshes(nui, "back-left");
  const usda = extractZipFile(Buffer.from(encodeUsdz(meshes)), "model.usda");
  expect(usda?.toString("utf8")).toBe(buildUsda(meshes));
});

test("the USDA declares meters, Y up, horizontal anchoring and one mesh per part", () => {
  const meshes = buildRoomMeshes(nui, "three-walls");
  const usda = buildUsda(meshes);
  expect(usda).toContain("metersPerUnit = 1");
  expect(usda).toContain('upAxis = "Y"');
  expect(usda).toContain('defaultPrim = "Root"');
  expect(usda).toContain('token preliminary:anchoring:type = "plane"');
  expect(usda).toContain('token preliminary:planeAnchoring:alignment = "horizontal"');
  expect(usda.match(/def Mesh "/g)).toHaveLength(meshes.length);
  expect(usda).toContain('def Mesh "wall_back"');
  expect(usda).toContain("rel material:binding = </Materials/nui_guide>");
});

test("points are written in meters and translucent materials keep their opacity", () => {
  const usda = buildUsda([boxMesh("box", [-0.05, 0, -0.025], [0.05, 0.12, 0.025], glass)]);
  // The first corner of the +X face is (max x, min y, max z).
  expect(usda).toContain("point3f[] points = [(0.05, 0, 0.025)");
  expect(usda).toContain("(0.05, 0.12, -0.025)");
  expect(usda).toContain("float inputs:opacity = 0.2");
  expect(usda).toContain("color3f inputs:diffuseColor = (0.5, 0.25, 1)");
  expect(usda).toContain("uniform bool doubleSided = 1");
  expect(usda).toContain(`int[] faceVertexCounts = [${new Array(12).fill(3).join(", ")}]`);
  expect(usda).not.toMatch(/\de[-+]\d/);
});

test("prim names are valid identifiers and stay unique", () => {
  const usda = buildUsda([
    boxMesh("1 box", [0, 0, 0], [1, 1, 1], glass),
    boxMesh("1 box", [1, 0, 0], [2, 1, 1], glass),
  ]);
  expect(usda).toContain('def Mesh "_1_box"');
  expect(usda).toContain('def Mesh "_1_box_1"');
  expect(usda.match(/def Material "/g)).toHaveLength(1);
  expect(() => buildUsda([])).toThrow();
});

import { expect, test } from "vitest";
import { encodeGlb } from "@/lib/ar/glb";
import { boxMesh, type ArMaterial } from "@/lib/ar/mesh";

// A reader written independently from the production encoder.
function readGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
    jsonLength,
    jsonType: view.getUint32(16, true),
    json: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))),
    binLength,
    binType: view.getUint32(binHeader + 4, true),
    bin: new DataView(bytes.buffer, bytes.byteOffset + binHeader + 8, binLength),
  };
}

const opaque: ArMaterial = { name: "opaque", color: [1, 0, 0, 1], roughness: 1, doubleSided: false };
const translucent: ArMaterial = { name: "clear", color: [0, 0, 1, 0.5], roughness: 1, doubleSided: true };

test("GLB header and chunks follow the glTF 2.0 binary layout", () => {
  const bytes = encodeGlb([boxMesh("box", [-0.1, 0, -0.05], [0.1, 0.2, 0.05], opaque)]);
  const glb = readGlb(bytes);
  expect(glb.magic).toBe(0x46546c67);
  expect(glb.version).toBe(2);
  expect(glb.length).toBe(bytes.byteLength);
  expect(glb.jsonType).toBe(0x4e4f534a);
  expect(glb.binType).toBe(0x004e4942);
  expect(glb.jsonLength % 4).toBe(0);
  expect(glb.binLength % 4).toBe(0);
  expect(20 + glb.jsonLength + 8 + glb.binLength).toBe(bytes.byteLength);
  expect(glb.json.asset.version).toBe("2.0");
  expect(glb.json.buffers).toEqual([{ byteLength: glb.binLength }]);
});

test("accessors describe bounded positions, normals and indices inside the binary chunk", () => {
  const bytes = encodeGlb([boxMesh("box", [-0.1, 0, -0.05], [0.1, 0.2, 0.05], opaque)]);
  const { json, bin, binLength } = readGlb(bytes);
  const primitive = json.meshes[0].primitives[0];
  const position = json.accessors[primitive.attributes.POSITION];
  expect(position).toMatchObject({ componentType: 5126, type: "VEC3", count: 24 });
  expect(position.min).toEqual([Math.fround(-0.1), 0, Math.fround(-0.05)]);
  expect(position.max).toEqual([Math.fround(0.1), Math.fround(0.2), Math.fround(0.05)]);
  expect(json.accessors[primitive.attributes.NORMAL]).toMatchObject({ componentType: 5126, count: 24 });
  const indices = json.accessors[primitive.indices];
  expect(indices).toMatchObject({ componentType: 5125, type: "SCALAR", count: 36 });

  for (const view of json.bufferViews) {
    expect(view.byteOffset % 4).toBe(0);
    expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(binLength);
  }
  const indexView = json.bufferViews[indices.bufferView];
  const indexValues = Array.from({ length: 36 }, (_, i) =>
    bin.getUint32(indexView.byteOffset + i * 4, true),
  );
  expect(Math.min(...indexValues)).toBe(0);
  expect(Math.max(...indexValues)).toBe(23);
  const positionView = json.bufferViews[position.bufferView];
  const heights = Array.from({ length: 24 }, (_, i) =>
    bin.getFloat32(positionView.byteOffset + i * 12 + 4, true),
  );
  expect(Math.min(...heights)).toBe(0);
  expect(Math.max(...heights)).toBeCloseTo(0.2, 6);
});

test("materials are shared by name and translucent colors use alpha blending", () => {
  const { json } = readGlb(
    encodeGlb([
      boxMesh("a", [0, 0, 0], [1, 1, 1], opaque),
      boxMesh("b", [1, 0, 0], [2, 1, 1], opaque),
      boxMesh("c", [2, 0, 0], [3, 1, 1], translucent),
    ]),
  );
  expect(json.materials).toHaveLength(2);
  expect(json.materials[0]).toMatchObject({ alphaMode: "OPAQUE", doubleSided: false });
  expect(json.materials[1]).toMatchObject({ alphaMode: "BLEND", doubleSided: true });
  expect(json.meshes.map((m: { primitives: { material: number }[] }) => m.primitives[0].material)).toEqual([0, 0, 1]);
  expect(json.scenes[0].nodes).toEqual([0, 1, 2]);
});

test("non-indexed meshes are written without an index accessor", () => {
  const box = boxMesh("box", [0, 0, 0], [1, 1, 1], opaque);
  const soup = {
    ...box,
    positions: box.positions.slice(0, 9),
    normals: box.normals.slice(0, 9),
    indices: null,
  };
  const { json } = readGlb(encodeGlb([soup]));
  expect(json.meshes[0].primitives[0].indices).toBeUndefined();
  expect(json.accessors).toHaveLength(2);
});

test("invalid meshes are rejected instead of producing a broken file", () => {
  const box = boxMesh("box", [0, 0, 0], [1, 1, 1], opaque);
  expect(() => encodeGlb([])).toThrow();
  expect(() => encodeGlb([{ ...box, normals: new Float32Array(3) }])).toThrow(/法線/);
  expect(() => encodeGlb([{ ...box, indices: Uint32Array.from([0, 1, 99]) }])).toThrow(/存在しない頂点/);
  expect(() =>
    encodeGlb([{ ...box, positions: box.positions.map((v, i) => (i === 0 ? Number.NaN : v)) }]),
  ).toThrow(/座標/);
});

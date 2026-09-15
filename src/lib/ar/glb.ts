import type { ArMaterial, ArMesh } from "./mesh.ts";

// glTF 2.0 のバイナリ形式（GLB）で仕様が決めている値
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN"
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const ALIGNMENT = 4;
const JSON_PADDING = 0x20; // JSON チャンクは空白で詰める
const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT_BYTES = 4;
const UINT_BYTES = 4;
const OPAQUE_ALPHA = 1;

const padded = (bytes: number) => Math.ceil(bytes / ALIGNMENT) * ALIGNMENT;

type Writer = { offset: number; values: Float32Array | Uint32Array };

function validate(mesh: ArMesh) {
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount === 0)
    throw new Error(`メッシュ「${mesh.name}」の頂点が不正です`);
  if (mesh.normals.length !== mesh.positions.length)
    throw new Error(`メッシュ「${mesh.name}」の法線の数が頂点と一致しません`);
  for (const value of mesh.positions) {
    if (!Number.isFinite(value)) throw new Error(`メッシュ「${mesh.name}」の座標が不正です`);
  }
  if (mesh.indices) {
    if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0)
      throw new Error(`メッシュ「${mesh.name}」の三角形が不正です`);
    for (const index of mesh.indices) {
      if (index >= vertexCount)
        throw new Error(`メッシュ「${mesh.name}」が存在しない頂点を参照しています`);
    }
  } else if (vertexCount % 3 !== 0) {
    throw new Error(`メッシュ「${mesh.name}」の三角形が不正です`);
  }
}

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = Math.fround(positions[i + k]);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/** メッシュの一覧を、1ファイルで完結する GLB（バイナリの glTF 2.0）にする */
export function encodeGlb(meshes: ArMesh[], generator = "OshiNest AR"): Uint8Array<ArrayBuffer> {
  if (meshes.length === 0) throw new Error("GLB に書き出すメッシュがありません");

  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const materials: object[] = [];
  const materialIndex = new Map<string, number>();
  const writers: Writer[] = [];
  let binLength = 0;

  const addView = (values: Float32Array | Uint32Array, target: number) => {
    const offset = padded(binLength);
    const byteLength = values.length * (values instanceof Float32Array ? FLOAT_BYTES : UINT_BYTES);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength, target });
    writers.push({ offset, values });
    binLength = offset + byteLength;
    return bufferViews.length - 1;
  };

  const addAccessor = (accessor: object) => {
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const materialOf = (material: ArMaterial) => {
    const existing = materialIndex.get(material.name);
    if (existing !== undefined) return existing;
    materials.push({
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: [...material.color],
        metallicFactor: 0,
        roughnessFactor: material.roughness,
      },
      alphaMode: material.color[3] < OPAQUE_ALPHA ? "BLEND" : "OPAQUE",
      doubleSided: material.doubleSided,
    });
    materialIndex.set(material.name, materials.length - 1);
    return materials.length - 1;
  };

  const gltfMeshes = meshes.map((mesh) => {
    validate(mesh);
    const count = mesh.positions.length / 3;
    const position = addAccessor({
      bufferView: addView(mesh.positions, TARGET_ARRAY_BUFFER),
      componentType: COMPONENT_FLOAT,
      count,
      type: "VEC3",
      ...bounds(mesh.positions),
    });
    const normal = addAccessor({
      bufferView: addView(mesh.normals, TARGET_ARRAY_BUFFER),
      componentType: COMPONENT_FLOAT,
      count,
      type: "VEC3",
    });
    const indices = mesh.indices
      ? addAccessor({
          bufferView: addView(mesh.indices, TARGET_ELEMENT_ARRAY_BUFFER),
          componentType: COMPONENT_UNSIGNED_INT,
          count: mesh.indices.length,
          type: "SCALAR",
        })
      : undefined;
    return {
      name: mesh.name,
      primitives: [
        {
          attributes: { POSITION: position, NORMAL: normal },
          ...(indices === undefined ? {} : { indices }),
          material: materialOf(mesh.material),
        },
      ],
    };
  });

  const binBytes = padded(binLength);
  const jsonBytes = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0", generator },
      scene: 0,
      scenes: [{ nodes: meshes.map((_, i) => i) }],
      nodes: meshes.map((mesh, i) => ({ name: mesh.name, mesh: i })),
      meshes: gltfMeshes,
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: binBytes }],
    }),
  );
  const jsonChunkBytes = padded(jsonBytes.length);
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonChunkBytes + CHUNK_HEADER_BYTES + binBytes;

  // 端末のバイト順に左右されないよう、数値は DataView でリトルエンディアンに書く
  const out = new Uint8Array(new ArrayBuffer(total));
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);

  let at = HEADER_BYTES;
  view.setUint32(at, jsonChunkBytes, true);
  view.setUint32(at + 4, CHUNK_JSON, true);
  at += CHUNK_HEADER_BYTES;
  out.set(jsonBytes, at);
  out.fill(JSON_PADDING, at + jsonBytes.length, at + jsonChunkBytes);
  at += jsonChunkBytes;

  view.setUint32(at, binBytes, true);
  view.setUint32(at + 4, CHUNK_BIN, true);
  at += CHUNK_HEADER_BYTES;
  for (const { offset, values } of writers) {
    const base = at + offset;
    if (values instanceof Float32Array) {
      for (let i = 0; i < values.length; i++) view.setFloat32(base + i * FLOAT_BYTES, values[i], true);
    } else {
      for (let i = 0; i < values.length; i++) view.setUint32(base + i * UINT_BYTES, values[i], true);
    }
  }
  return out;
}

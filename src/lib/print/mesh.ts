// 解析で扱うメッシュの共通表現。
// パーサ（3MF / STL）はすべてこの形に落としてから解析にかける。

export type Mesh = {
  // 頂点座標を [x0,y0,z0, x1,y1,z1, ...] で持つ（mm 単位）
  positions: Float64Array;
  // 三角形の頂点インデックス [a0,b0,c0, a1,b1,c1, ...]
  indices: Uint32Array;
  // 三角形ごとのマテリアル（色スロット）番号。持たない形式では null
  materialIndices: Int32Array | null;
};

export type NamedMesh = {
  name: string;
  mesh: Mesh;
};

export type Vec3 = [number, number, number];

export type Bounds = {
  min: Vec3;
  max: Vec3;
};

export function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

export function boundsOf(mesh: Mesh): Bounds {
  const b = emptyBounds();
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (v < b.min[k]) b.min[k] = v;
      if (v > b.max[k]) b.max[k] = v;
    }
  }
  if (!Number.isFinite(b.min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return b;
}

export function boundsSize(b: Bounds): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export function triangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3;
}

// 行優先 4x3（3MF の transform 属性の並び）を頂点に適用する
export type Matrix4x3 = [
  number, number, number,
  number, number, number,
  number, number, number,
  number, number, number,
];

export function parseTransform(text: string | undefined): Matrix4x3 | null {
  if (!text) return null;
  const n = text.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((v) => !Number.isFinite(v))) return null;
  return n as Matrix4x3;
}

export function multiplyTransform(a: Matrix4x3, b: Matrix4x3): Matrix4x3 {
  // a を適用したあとに b を適用する合成（どちらも行優先 4x3、平行移動は末尾3要素）
  const out = new Array(12).fill(0) as number[];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  for (let c = 0; c < 3; c++) {
    out[9 + c] = a[9] * b[c] + a[10] * b[3 + c] + a[11] * b[6 + c] + b[9 + c];
  }
  return out as Matrix4x3;
}

export function applyTransform(mesh: Mesh, m: Matrix4x3): Mesh {
  const p = mesh.positions;
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i] = x * m[0] + y * m[3] + z * m[6] + m[9];
    out[i + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
    out[i + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
  }
  return { positions: out, indices: mesh.indices, materialIndices: mesh.materialIndices };
}

export function scaleMesh(mesh: Mesh, s: number): Mesh {
  const p = mesh.positions;
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = p[i] * s;
  return { positions: out, indices: mesh.indices, materialIndices: mesh.materialIndices };
}

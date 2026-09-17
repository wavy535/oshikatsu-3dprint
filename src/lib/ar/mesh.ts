export type Vec3 = [number, number, number];
export type Rgba = readonly [number, number, number, number];

export type ArMaterial = {
  name: string;
  color: Rgba;
  roughness: number;
  doubleSided: boolean;
};

/** GLB に書き出す1つのメッシュ。メートル単位で、Y 軸が上、手前が +Z */
export type ArMesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array | null;
  material: ArMaterial;
};

// 直方体の6面。法線と、外側から見て反時計回りに並ぶ4隅（-1 / +1 の組）
const BOX_FACES: { normal: Vec3; corners: Vec3[] }[] = [
  { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

const MM_PER_M = 1000;

/** メッシュ全体の外形（mm）。幅は左右（X）、奥行は前後（Z）、高さは上下（Y） */
export function meshSizeMm(meshes: ArMesh[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (mesh.positions[i + k] < min[k]) min[k] = mesh.positions[i + k];
        if (mesh.positions[i + k] > max[k]) max[k] = mesh.positions[i + k];
      }
    }
  }
  if (!Number.isFinite(min[0])) return { widthMm: 0, depthMm: 0, heightMm: 0 };
  return {
    widthMm: (max[0] - min[0]) * MM_PER_M,
    depthMm: (max[2] - min[2]) * MM_PER_M,
    heightMm: (max[1] - min[1]) * MM_PER_M,
  };
}

/** 最小・最大の座標（メートル）で直方体を作る */
export function boxMesh(name: string, min: Vec3, max: Vec3, material: ArMaterial): ArMesh {
  const positions = new Float32Array(BOX_FACES.length * 4 * 3);
  const normals = new Float32Array(BOX_FACES.length * 4 * 3);
  const indices = new Uint32Array(BOX_FACES.length * 6);
  BOX_FACES.forEach((face, f) => {
    face.corners.forEach((corner, c) => {
      const v = (f * 4 + c) * 3;
      for (let k = 0; k < 3; k++) {
        positions[v + k] = corner[k] < 0 ? min[k] : max[k];
        normals[v + k] = face.normal[k];
      }
    });
    const base = f * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], f * 6);
  });
  return { name, positions, normals, indices, material };
}

import { AnalysisBudget, checkMeshSize } from "./limits.ts";

// Catmull-Clark 分割（Blender の Subdivision Surface モディファイアの再現）。
// 境界の辺と、3つ以上の面が接する辺は鋭い辺として扱う（Blender が使う OpenSubdiv の既定と同じ）。
// クリース（辺の折り目の強さ）は再現しない。

/**
 * 多角形のメッシュ。faceOffsets は面ごとの cornerVerts の開始位置（面の数 + 1 個）。
 * faceMaterials は面ごとの材質の番号で、分割しても元の面の値を引き継ぐ（色を保つため）。
 */
export type PolyMesh = {
  positions: Float64Array;
  faceOffsets: Int32Array;
  cornerVerts: Int32Array;
  faceMaterials?: Int32Array | null;
};

export type CatmullClarkOptions = {
  levels: number;
  // 最後に頂点をリミットサーフェス（無限に分割したときの位置）へ移す。Blender の「リミットサーフェスを使用」
  limitSurface: boolean;
  // 面が1つだけの角の頂点を動かさない。Blender の「境界のスムーズ：角を維持」
  preserveCorners: boolean;
  budget: AnalysisBudget;
};

const REGULAR_BOUNDARY_EDGES = 2;
const QUAD_CORNERS = 4;
// 規則の係数（Catmull-Clark と、その境界・リミットの重み）
const CREASE_SELF_WEIGHT = 6;
const CREASE_TOTAL_WEIGHT = 8;
const CREASE_LIMIT_SELF_WEIGHT = 4;
const CREASE_LIMIT_TOTAL_WEIGHT = 6;
const EDGE_NEIGHBOR_LIMIT_WEIGHT = 4;
const LIMIT_VALENCE_OFFSET = 5;
const INTERIOR_MIN_VALENCE = 3;
// 処理時間の上限を確かめる間隔（面の数）
const BUDGET_CHECK_INTERVAL = 1 << 14;

type Edges = {
  count: number;
  // 各角（corner）から、同じ面の次の角への辺の番号
  cornerEdge: Int32Array;
  v0: Int32Array;
  v1: Int32Array;
  faces: Int32Array;
};

function buildEdges(mesh: PolyMesh, budget: AnalysisBudget): Edges {
  const vertexCount = mesh.positions.length / 3;
  const faceCount = mesh.faceOffsets.length - 1;
  const corners = mesh.cornerVerts.length;
  const index = new Map<number, number>();
  const cornerEdge = new Int32Array(corners);
  const v0: number[] = [];
  const v1: number[] = [];
  const faces: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    if (f % BUDGET_CHECK_INTERVAL === 0) budget.check();
    const start = mesh.faceOffsets[f];
    const end = mesh.faceOffsets[f + 1];
    for (let c = start; c < end; c++) {
      const a = mesh.cornerVerts[c];
      const b = mesh.cornerVerts[c + 1 < end ? c + 1 : start];
      const key = Math.min(a, b) * vertexCount + Math.max(a, b);
      let edge = index.get(key);
      if (edge === undefined) {
        edge = v0.length;
        index.set(key, edge);
        v0.push(a);
        v1.push(b);
        faces.push(0);
      }
      faces[edge]++;
      cornerEdge[c] = edge;
    }
  }
  return {
    count: v0.length,
    cornerEdge,
    v0: Int32Array.from(v0),
    v1: Int32Array.from(v1),
    faces: Int32Array.from(faces),
  };
}

// 頂点ごとの、接する辺の数・鋭い辺の数・鋭い辺の相手の位置の和・接する面の数
function vertexStats(mesh: PolyMesh, edges: Edges) {
  const vertexCount = mesh.positions.length / 3;
  const valence = new Int32Array(vertexCount);
  const sharp = new Int32Array(vertexCount);
  const sharpNeighborSum = new Float64Array(vertexCount * 3);
  const neighborSum = new Float64Array(vertexCount * 3);
  const faceCount = new Int32Array(vertexCount);
  const p = mesh.positions;
  for (let e = 0; e < edges.count; e++) {
    const a = edges.v0[e];
    const b = edges.v1[e];
    valence[a]++;
    valence[b]++;
    for (let k = 0; k < 3; k++) {
      neighborSum[a * 3 + k] += p[b * 3 + k];
      neighborSum[b * 3 + k] += p[a * 3 + k];
    }
    if (edges.faces[e] !== 2) {
      sharp[a]++;
      sharp[b]++;
      for (let k = 0; k < 3; k++) {
        sharpNeighborSum[a * 3 + k] += p[b * 3 + k];
        sharpNeighborSum[b * 3 + k] += p[a * 3 + k];
      }
    }
  }
  for (const v of mesh.cornerVerts) faceCount[v]++;
  return { valence, sharp, sharpNeighborSum, neighborSum, faceCount };
}

// 動かさない角の頂点か。鋭い辺が1本か3本以上なら角、2本なら境界（「角を維持」のときは面が1つなら角）
function isCorner(sharp: number, faces: number, preserveCorners: boolean) {
  if (sharp === 0) return false;
  if (sharp !== REGULAR_BOUNDARY_EDGES) return true;
  return preserveCorners && faces === 1;
}

function subdivideOnce(mesh: PolyMesh, options: CatmullClarkOptions): PolyMesh {
  const { budget } = options;
  const p = mesh.positions;
  const vertexCount = p.length / 3;
  const faceCount = mesh.faceOffsets.length - 1;
  const corners = mesh.cornerVerts.length;
  const edges = buildEdges(mesh, budget);
  checkMeshSize(vertexCount + edges.count + faceCount, corners * 2);

  // 面の点：面の頂点の平均
  const facePoints = new Float64Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const start = mesh.faceOffsets[f];
    const end = mesh.faceOffsets[f + 1];
    for (let c = start; c < end; c++) {
      for (let k = 0; k < 3; k++) facePoints[f * 3 + k] += p[mesh.cornerVerts[c] * 3 + k];
    }
    for (let k = 0; k < 3; k++) facePoints[f * 3 + k] /= end - start;
  }

  // 辺の点：鋭くない辺は両端と両側の面の点の平均、鋭い辺は中点
  const edgeFaceSum = new Float64Array(edges.count * 3);
  for (let f = 0; f < faceCount; f++) {
    for (let c = mesh.faceOffsets[f]; c < mesh.faceOffsets[f + 1]; c++) {
      const e = edges.cornerEdge[c];
      for (let k = 0; k < 3; k++) edgeFaceSum[e * 3 + k] += facePoints[f * 3 + k];
    }
  }
  const edgePoints = new Float64Array(edges.count * 3);
  for (let e = 0; e < edges.count; e++) {
    const a = edges.v0[e] * 3;
    const b = edges.v1[e] * 3;
    for (let k = 0; k < 3; k++) {
      edgePoints[e * 3 + k] =
        edges.faces[e] === 2 ? (p[a + k] + p[b + k] + edgeFaceSum[e * 3 + k]) / 4 : (p[a + k] + p[b + k]) / 2;
    }
  }

  // 元の頂点の新しい位置
  const stats = vertexStats(mesh, edges);
  const vertexFaceSum = new Float64Array(vertexCount * 3);
  for (let f = 0; f < faceCount; f++) {
    for (let c = mesh.faceOffsets[f]; c < mesh.faceOffsets[f + 1]; c++) {
      const v = mesh.cornerVerts[c];
      for (let k = 0; k < 3; k++) vertexFaceSum[v * 3 + k] += facePoints[f * 3 + k];
    }
  }
  const positions = new Float64Array((vertexCount + edges.count + faceCount) * 3);
  for (let v = 0; v < vertexCount; v++) {
    const n = stats.valence[v];
    const sharp = stats.sharp[v];
    const faces = stats.faceCount[v];
    for (let k = 0; k < 3; k++) {
      const self = p[v * 3 + k];
      let value = self;
      if (faces === 0 || isCorner(sharp, faces, options.preserveCorners)) {
        value = self;
      } else if (sharp === REGULAR_BOUNDARY_EDGES) {
        value = (CREASE_SELF_WEIGHT * self + stats.sharpNeighborSum[v * 3 + k]) / CREASE_TOTAL_WEIGHT;
      } else if (n >= INTERIOR_MIN_VALENCE) {
        // (面の点の平均 + 2 × 辺の中点の平均 + (n - 3) × 自分) / n。辺の中点の平均 = (自分 + 隣の平均) / 2
        const faceAverage = vertexFaceSum[v * 3 + k] / faces;
        const midpointAverage = (self + stats.neighborSum[v * 3 + k] / n) / 2;
        value = (faceAverage + 2 * midpointAverage + (n - INTERIOR_MIN_VALENCE) * self) / n;
      }
      positions[v * 3 + k] = value;
    }
  }
  positions.set(edgePoints, vertexCount * 3);
  positions.set(facePoints, (vertexCount + edges.count) * 3);

  // 面ごとに、角の数だけ四角形を作る：(頂点, 次への辺の点, 面の点, 前からの辺の点)
  const faceOffsets = new Int32Array(corners + 1);
  const cornerVerts = new Int32Array(corners * QUAD_CORNERS);
  const faceMaterials = mesh.faceMaterials ? new Int32Array(corners) : null;
  let quad = 0;
  for (let f = 0; f < faceCount; f++) {
    if (f % BUDGET_CHECK_INTERVAL === 0) budget.check();
    const start = mesh.faceOffsets[f];
    const end = mesh.faceOffsets[f + 1];
    for (let c = start; c < end; c++) {
      const previous = c === start ? end - 1 : c - 1;
      const out = quad * QUAD_CORNERS;
      cornerVerts[out] = mesh.cornerVerts[c];
      cornerVerts[out + 1] = vertexCount + edges.cornerEdge[c];
      cornerVerts[out + 2] = vertexCount + edges.count + f;
      cornerVerts[out + 3] = vertexCount + edges.cornerEdge[previous];
      if (faceMaterials && mesh.faceMaterials) faceMaterials[quad] = mesh.faceMaterials[f];
      quad++;
      faceOffsets[quad] = quad * QUAD_CORNERS;
    }
  }
  return { positions, faceOffsets, cornerVerts, faceMaterials };
}

// 四角形だけのメッシュの頂点を、リミットサーフェス上の位置に移す
function projectToLimit(mesh: PolyMesh, options: CatmullClarkOptions): PolyMesh {
  const p = mesh.positions;
  const vertexCount = p.length / 3;
  const edges = buildEdges(mesh, options.budget);
  const stats = vertexStats(mesh, edges);
  // 各頂点で、接する四角形の対角の頂点の位置の和
  const diagonalSum = new Float64Array(vertexCount * 3);
  const faceCount = mesh.faceOffsets.length - 1;
  for (let f = 0; f < faceCount; f++) {
    const start = mesh.faceOffsets[f];
    for (let i = 0; i < QUAD_CORNERS; i++) {
      const v = mesh.cornerVerts[start + i];
      const opposite = mesh.cornerVerts[start + ((i + 2) % QUAD_CORNERS)];
      for (let k = 0; k < 3; k++) diagonalSum[v * 3 + k] += p[opposite * 3 + k];
    }
  }
  const positions = new Float64Array(p.length);
  for (let v = 0; v < vertexCount; v++) {
    const n = stats.valence[v];
    const sharp = stats.sharp[v];
    const faces = stats.faceCount[v];
    for (let k = 0; k < 3; k++) {
      const self = p[v * 3 + k];
      let value = self;
      if (faces === 0 || isCorner(sharp, faces, options.preserveCorners)) {
        value = self;
      } else if (sharp === REGULAR_BOUNDARY_EDGES) {
        value = (CREASE_LIMIT_SELF_WEIGHT * self + stats.sharpNeighborSum[v * 3 + k]) / CREASE_LIMIT_TOTAL_WEIGHT;
      } else if (n >= INTERIOR_MIN_VALENCE && faces === n) {
        // (n² × 自分 + 4 × 辺の隣の和 + 対角の和) / (n × (n + 5))
        value =
          (n * n * self + EDGE_NEIGHBOR_LIMIT_WEIGHT * stats.neighborSum[v * 3 + k] + diagonalSum[v * 3 + k]) /
          (n * (n + LIMIT_VALENCE_OFFSET));
      }
      positions[v * 3 + k] = value;
    }
  }
  return {
    positions,
    faceOffsets: mesh.faceOffsets,
    cornerVerts: mesh.cornerVerts,
    faceMaterials: mesh.faceMaterials ?? null,
  };
}

/** Catmull-Clark 分割を levels 回かける。levels が 0 以下なら元のメッシュを返す */
export function catmullClark(mesh: PolyMesh, options: CatmullClarkOptions): PolyMesh {
  if (options.levels <= 0) return mesh;
  let current = mesh;
  for (let level = 0; level < options.levels; level++) current = subdivideOnce(current, options);
  return options.limitSurface ? projectToLimit(current, options) : current;
}

import { AnalysisBudget } from "../print/limits.ts";
import { AR_LIMITS } from "./config.ts";
import { ArInputError } from "./errors.ts";

/** 位置（[x0,y0,z0, x1,...]）と三角形の頂点番号だけを持つメッシュ */
export type TriangleMesh = { positions: Float64Array; indices: Uint32Array };

// 処理時間の上限を確認する間隔（頂点数）
const BUDGET_CHECK_INTERVAL = 1 << 16;

type Grid = { min: [number, number, number]; extent: number };

function gridOf(positions: Float64Array): Grid {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (positions[i + k] < min[k]) min[k] = positions[i + k];
      if (positions[i + k] > max[k]) max[k] = positions[i + k];
    }
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(extent > 0)) throw new ArInputError("形状の大きさが0のため AR 用に変換できません");
  return { min, extent };
}

// 頂点ごとに、入っている格子のセル番号を書き込む
function writeCellKeys(
  positions: Float64Array,
  grid: Grid,
  resolution: number,
  keys: Float64Array,
  budget: AnalysisBudget,
) {
  const cell = grid.extent / resolution;
  const cells = resolution + 1;
  for (let v = 0; v < keys.length; v++) {
    if (v % BUDGET_CHECK_INTERVAL === 0) budget.check();
    const p = v * 3;
    const ix = Math.min(resolution, Math.floor((positions[p] - grid.min[0]) / cell));
    const iy = Math.min(resolution, Math.floor((positions[p + 1] - grid.min[1]) / cell));
    const iz = Math.min(resolution, Math.floor((positions[p + 2] - grid.min[2]) / cell));
    keys[v] = ix + cells * (iy + cells * iz);
  }
}

// 3頂点が別々のセルに入っている（つぶれない）三角形の数
function countSurviving(indices: Uint32Array, keys: Float64Array) {
  let count = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = keys[indices[t]];
    const b = keys[indices[t + 1]];
    const c = keys[indices[t + 2]];
    if (a !== b && b !== c && a !== c) count++;
  }
  return count;
}

// 同じセルの頂点を平均の位置の1頂点にまとめ、つぶれた三角形を捨てる
function clusterByKeys(mesh: TriangleMesh, keys: Float64Array): TriangleMesh {
  const idOfKey = new Map<number, number>();
  const sums: number[] = [];
  const counts: number[] = [];
  const ids = new Uint32Array(keys.length);
  for (let v = 0; v < keys.length; v++) {
    let id = idOfKey.get(keys[v]);
    if (id === undefined) {
      id = counts.length;
      idOfKey.set(keys[v], id);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    ids[v] = id;
    for (let k = 0; k < 3; k++) sums[id * 3 + k] += mesh.positions[v * 3 + k];
    counts[id]++;
  }

  const positions = new Float64Array(counts.length * 3);
  for (let id = 0; id < counts.length; id++) {
    for (let k = 0; k < 3; k++) positions[id * 3 + k] = sums[id * 3 + k] / counts[id];
  }

  const indices: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = ids[mesh.indices[t]];
    const b = ids[mesh.indices[t + 1]];
    const c = ids[mesh.indices[t + 2]];
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }
  return { positions, indices: Uint32Array.from(indices) };
}

/**
 * 格子で頂点をまとめて三角形を減らす（頂点クラスタリング）。
 * 細部は失われるが、AR で置いて大きさを見る用途には足りる。
 * 三角形数が maxTriangles 以下に収まる範囲で、いちばん細かい格子を二分探索で選ぶ。
 */
export function decimateToBudget(
  mesh: TriangleMesh,
  maxTriangles: number,
  budget = new AnalysisBudget(),
): TriangleMesh & { resolution: number | null } {
  if (mesh.indices.length / 3 <= maxTriangles) return { ...mesh, resolution: null };

  const grid = gridOf(mesh.positions);
  const keys = new Float64Array(mesh.positions.length / 3);
  const countAt = (resolution: number) => {
    writeCellKeys(mesh.positions, grid, resolution, keys, budget);
    return countSurviving(mesh.indices, keys);
  };

  let low: number = AR_LIMITS.decimateMinResolution;
  let high: number = AR_LIMITS.decimateMaxResolution;
  if (countAt(low) > maxTriangles)
    throw new ArInputError("AR 用に面数を減らせませんでした");
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (countAt(mid) <= maxTriangles) low = mid;
    else high = mid - 1;
  }

  writeCellKeys(mesh.positions, grid, low, keys, budget);
  return { ...clusterByKeys(mesh, keys), resolution: low };
}

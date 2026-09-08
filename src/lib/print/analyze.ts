import { boundsOf, boundsSize, triangleCount, type Bounds, type Mesh } from "./mesh.ts";

// メッシュの形状解析。
// スライサーが落ちる原因（穴・法線の反転・薄すぎる壁・自己交差）を、
// アップロード時にサーバ側で機械的に見つけるための処理をまとめている。

export type TopologyReport = {
  openEdgeCount: number;        // 片側にしか三角形がないエッジ＝穴
  nonManifoldEdgeCount: number; // 3枚以上の三角形が共有するエッジ
  flippedNormalCount: number;   // 巻き順が隣と揃っていない三角形
  isManifold: boolean;
  weldedVertexCount: number;
  duplicateTriangleCount: number;
};

export type GeometryReport = {
  volumeMm3: number;        // 符号付き体積の絶対値
  signedVolumeMm3: number;  // 負なら全体が裏返っている
  surfaceAreaMm2: number;
  bounds: Bounds;
};

export type ThicknessReport = {
  // 実用上の最小肉厚。三角形1枚だけのスライバーに引きずられないよう、
  // 面積で重み付けした下位1パーセンタイルを使う。
  minWallThicknessMm: number | null;
  // 参考値：サンプル中の生の最小値
  rawMinWallThicknessMm: number | null;
  sampleCount: number;
  thinFaceCount: number;
  // しきい値未満だった面が、測定できた表面積に占める割合
  thinAreaRatio: number;
};

export type SelfIntersectionReport = {
  count: number;
  sampleCount: number;
  complete: boolean; // 全三角形を調べきれたか
};

export type MeshAnalysis = {
  triangleCount: number;
  topology: TopologyReport;
  geometry: GeometryReport;
  thickness: ThicknessReport;
  selfIntersection: SelfIntersectionReport;
};

// ---------------------------------------------------------------------------
// 頂点の溶接
//   STL は頂点を共有しないので、そのままではエッジの接続を判定できない。
//   モデルのサイズに対する相対許容差で量子化してから同一視する。
// ---------------------------------------------------------------------------
export type WeldedMesh = {
  positions: Float64Array;
  indices: Uint32Array;
  vertexCount: number;
};

export function weldVertices(mesh: Mesh, toleranceMm?: number): WeldedMesh {
  const b = boundsOf(mesh);
  const size = boundsSize(b);
  const maxDim = Math.max(size[0], size[1], size[2], 1e-6);
  const tol = toleranceMm ?? Math.max(maxDim * 1e-6, 1e-5);
  const inv = 1 / tol;

  const map = new Map<string, number>();
  const out: number[] = [];
  const remap = new Uint32Array(mesh.positions.length / 3);

  for (let i = 0; i < mesh.positions.length; i += 3) {
    const qx = Math.round(mesh.positions[i] * inv);
    const qy = Math.round(mesh.positions[i + 1] * inv);
    const qz = Math.round(mesh.positions[i + 2] * inv);
    const key = `${qx},${qy},${qz}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = out.length / 3;
      map.set(key, idx);
      out.push(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    }
    remap[i / 3] = idx;
  }

  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) indices[i] = remap[mesh.indices[i]];

  return { positions: Float64Array.from(out), indices, vertexCount: out.length / 3 };
}

// ---------------------------------------------------------------------------
// トポロジ：穴・非多様体エッジ・巻き順のズレ
// ---------------------------------------------------------------------------
export function analyzeTopology(w: WeldedMesh): TopologyReport {
  const dirFirst = new Map<number, number>(); // 有向エッジ a->b を最初に出した三角形
  const dirCount = new Map<number, number>();
  const undir = new Map<number, number>();
  const flippedTris = new Set<number>();
  const tris = new Set<string>();
  let duplicateTriangleCount = 0;

  const key = (a: number, b: number) => a * 4294967296 + b;

  const n = w.indices.length;
  for (let i = 0; i < n; i += 3) {
    const t = i / 3;
    const a = w.indices[i], b = w.indices[i + 1], c = w.indices[i + 2];
    if (a === b || b === c || a === c) continue; // 退化三角形は数えない

    const sorted = [a, b, c].sort((x, y) => x - y).join(",");
    if (tris.has(sorted)) duplicateTriangleCount++;
    else tris.add(sorted);

    const edges: [number, number][] = [[a, b], [b, c], [c, a]];
    for (const [p, q] of edges) {
      const dk = key(p, q);
      const prev = dirFirst.get(dk);
      if (prev === undefined) {
        dirFirst.set(dk, t);
        dirCount.set(dk, 1);
      } else {
        // 同じ向きのエッジを2枚が共有している = 片方の巻き順が逆
        dirCount.set(dk, (dirCount.get(dk) ?? 1) + 1);
        flippedTris.add(prev);
        flippedTris.add(t);
      }
      const lo = Math.min(p, q), hi = Math.max(p, q);
      const uk = key(lo, hi);
      undir.set(uk, (undir.get(uk) ?? 0) + 1);
    }
  }

  let openEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of undir.values()) {
    if (count === 1) openEdgeCount++;
    else if (count > 2) nonManifoldEdgeCount++;
  }

  // 逆向きの対がないのに無向では2枚が共有しているエッジも、巻き順のズレ
  for (const [dk, count] of dirCount) {
    if (count !== 1) continue;
    const a = Math.floor(dk / 4294967296);
    const b = dk - a * 4294967296;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if ((undir.get(key(lo, hi)) ?? 0) === 2 && !dirCount.has(key(b, a))) {
      const t = dirFirst.get(dk);
      if (t !== undefined) flippedTris.add(t);
    }
  }

  return {
    openEdgeCount,
    nonManifoldEdgeCount,
    flippedNormalCount: flippedTris.size,
    isManifold: openEdgeCount === 0 && nonManifoldEdgeCount === 0 && flippedTris.size === 0,
    weldedVertexCount: w.vertexCount,
    duplicateTriangleCount,
  };
}

// ---------------------------------------------------------------------------
// 体積・表面積
// ---------------------------------------------------------------------------
export function analyzeGeometry(mesh: Mesh): GeometryReport {
  const p = mesh.positions;
  const idx = mesh.indices;
  let vol6 = 0;
  let area2 = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];

    // 符号付き四面体体積の6倍
    vol6 +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    area2 += Math.sqrt(nx * nx + ny * ny + nz * nz);
  }

  const signed = vol6 / 6;
  return {
    volumeMm3: Math.abs(signed),
    signedVolumeMm3: signed,
    surfaceAreaMm2: area2 / 2,
    bounds: boundsOf(mesh),
  };
}

// ---------------------------------------------------------------------------
// 空間グリッド（肉厚と自己交差の探索を現実的な時間に収めるため）
// ---------------------------------------------------------------------------
type Grid = {
  min: [number, number, number];
  cell: number;
  dims: [number, number, number];
  starts: Int32Array;
  items: Int32Array;
};

function buildGrid(mesh: Mesh, targetPerCell = 3): Grid {
  const b = boundsOf(mesh);
  const size = boundsSize(b);
  const triCount = triangleCount(mesh);
  const maxDim = Math.max(size[0], size[1], size[2], 1e-3);
  const cellsPerAxis = Math.min(
    160,
    Math.max(4, Math.ceil(Math.cbrt(triCount / targetPerCell)))
  );
  const cell = maxDim / cellsPerAxis;

  const dims: [number, number, number] = [
    Math.max(1, Math.ceil(size[0] / cell) + 1),
    Math.max(1, Math.ceil(size[1] / cell) + 1),
    Math.max(1, Math.ceil(size[2] / cell) + 1),
  ];
  const cellCount = dims[0] * dims[1] * dims[2];
  const counts = new Int32Array(cellCount + 1);
  const p = mesh.positions;
  const idx = mesh.indices;

  const cellRange = (t: number) => {
    const a = idx[t * 3] * 3, bb = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const lo: number[] = [], hi: number[] = [];
    for (let k = 0; k < 3; k++) {
      const v0 = p[a + k], v1 = p[bb + k], v2 = p[c + k];
      lo.push(Math.max(0, Math.floor((Math.min(v0, v1, v2) - b.min[k]) / cell)));
      hi.push(Math.min(dims[k] - 1, Math.floor((Math.max(v0, v1, v2) - b.min[k]) / cell)));
    }
    return { lo, hi };
  };

  for (let t = 0; t < triCount; t++) {
    const { lo, hi } = cellRange(t);
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++)
          counts[x + dims[0] * (y + dims[1] * z) + 1]++;
  }
  for (let i = 1; i <= cellCount; i++) counts[i] += counts[i - 1];

  const items = new Int32Array(counts[cellCount]);
  const cursor = Int32Array.from(counts.subarray(0, cellCount));
  for (let t = 0; t < triCount; t++) {
    const { lo, hi } = cellRange(t);
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const ci = x + dims[0] * (y + dims[1] * z);
          items[cursor[ci]++] = t;
        }
  }

  return { min: [b.min[0], b.min[1], b.min[2]], cell, dims, starts: counts, items };
}

// Möller–Trumbore。t（レイ上の距離）を返す。当たらなければ null。
function rayTriangle(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number
): { t: number; dot: number; normalLength: number } | null {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * invDet;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t <= 1e-7) return null;
  // 面法線とレイ方向の内積（裏面ヒットの判定に使う）
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return { t, dot: dx * nx + dy * ny + dz * nz, normalLength: Math.hypot(nx, ny, nz) };
}

function castRay(
  mesh: Mesh,
  grid: Grid,
  o: number[],
  d: number[],
  skipTri: number,
  minDistance = 0,
  minOpposition = 0
): number | null {
  const p = mesh.positions;
  const idx = mesh.indices;
  const { min, cell, dims, starts, items } = grid;
  // 発射元の三角形と頂点を共有する面（＝隣の面）は「反対側の壁」ではない。
  // これを除かないと、角や曲面のたびに厚み 0mm と判定されてしまう。
  const s0 = idx[skipTri * 3], s1 = idx[skipTri * 3 + 1], s2 = idx[skipTri * 3 + 2];
  const isAdjacent = (t: number) => {
    for (let i = 0; i < 3; i++) {
      const v = idx[t * 3 + i];
      if (v === s0 || v === s1 || v === s2) return true;
    }
    return false;
  };

  let cx = Math.floor((o[0] - min[0]) / cell);
  let cy = Math.floor((o[1] - min[1]) / cell);
  let cz = Math.floor((o[2] - min[2]) / cell);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= dims[0] || cy >= dims[1] || cz >= dims[2]) return null;

  const step = [d[0] > 0 ? 1 : -1, d[1] > 0 ? 1 : -1, d[2] > 0 ? 1 : -1];
  const tDelta = [
    d[0] === 0 ? Infinity : Math.abs(cell / d[0]),
    d[1] === 0 ? Infinity : Math.abs(cell / d[1]),
    d[2] === 0 ? Infinity : Math.abs(cell / d[2]),
  ];
  const nextBoundary = (k: number, c: number) =>
    min[k] + (d[k] > 0 ? c + 1 : c) * cell;
  const tMax = [
    d[0] === 0 ? Infinity : (nextBoundary(0, cx) - o[0]) / d[0],
    d[1] === 0 ? Infinity : (nextBoundary(1, cy) - o[1]) / d[1],
    d[2] === 0 ? Infinity : (nextBoundary(2, cz) - o[2]) / d[2],
  ];

  let best = Infinity;
  let guard = dims[0] + dims[1] + dims[2] + 8;

  while (guard-- > 0) {
    const ci = cx + dims[0] * (cy + dims[1] * cz);
    for (let s = starts[ci]; s < starts[ci + 1]; s++) {
      const t = items[s];
      if (t === skipTri || isAdjacent(t)) continue;
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const hit = rayTriangle(
        o[0], o[1], o[2], d[0], d[1], d[2],
        p[a], p[a + 1], p[a + 2],
        p[b], p[b + 1], p[b + 2],
        p[c], p[c + 1], p[c + 2]
      );
      // 反対側の壁＝レイと同じ向きを向いた面に当たったときだけ厚みとみなす。
      // さらに「正面から向かい合っているか」を見る。凹んだ角では隣の壁が
      // ほぼ直角に当たるだけで、それは肉厚ではないため除く。
      if (hit && hit.dot > 0 && hit.t >= minDistance && hit.t < best) {
        if (minOpposition > 0) {
          const nlen = hit.dot / Math.hypot(d[0], d[1], d[2]);
          const area2 = hit.normalLength;
          if (area2 > 0 && nlen / area2 < minOpposition) continue;
        }
        best = hit.t;
      }
    }

    const cellExit = Math.min(tMax[0], tMax[1], tMax[2]);
    if (best <= cellExit) break;

    if (tMax[0] <= tMax[1] && tMax[0] <= tMax[2]) { cx += step[0]; tMax[0] += tDelta[0]; }
    else if (tMax[1] <= tMax[2]) { cy += step[1]; tMax[1] += tDelta[1]; }
    else { cz += step[2]; tMax[2] += tDelta[2]; }

    if (cx < 0 || cy < 0 || cz < 0 || cx >= dims[0] || cy >= dims[1] || cz >= dims[2]) break;
  }

  return Number.isFinite(best) ? best : null;
}

// レイ上の交差回数を数える（点が材料の内側にあるかの判定に使う）。
// パーツを和を取らずに重ねたモデルでは「内部にある面」が大量に存在し、
// そこから測った距離は肉厚ではないので、この判定で除外する。
function countCrossings(mesh: Mesh, grid: Grid, o: number[], d: number[]): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  const { min, cell, dims, starts, items } = grid;

  let cx = Math.floor((o[0] - min[0]) / cell);
  let cy = Math.floor((o[1] - min[1]) / cell);
  let cz = Math.floor((o[2] - min[2]) / cell);
  if (cx < 0 || cy < 0 || cz < 0 || cx >= dims[0] || cy >= dims[1] || cz >= dims[2]) return 0;

  const step = [d[0] > 0 ? 1 : -1, d[1] > 0 ? 1 : -1, d[2] > 0 ? 1 : -1];
  const tDelta = [
    d[0] === 0 ? Infinity : Math.abs(cell / d[0]),
    d[1] === 0 ? Infinity : Math.abs(cell / d[1]),
    d[2] === 0 ? Infinity : Math.abs(cell / d[2]),
  ];
  const nextBoundary = (k: number, c: number) => min[k] + (d[k] > 0 ? c + 1 : c) * cell;
  const tMax = [
    d[0] === 0 ? Infinity : (nextBoundary(0, cx) - o[0]) / d[0],
    d[1] === 0 ? Infinity : (nextBoundary(1, cy) - o[1]) / d[1],
    d[2] === 0 ? Infinity : (nextBoundary(2, cz) - o[2]) / d[2],
  ];

  const hitTris = new Set<number>();
  let guard = dims[0] + dims[1] + dims[2] + 8;

  while (guard-- > 0) {
    const ci = cx + dims[0] * (cy + dims[1] * cz);
    for (let s = starts[ci]; s < starts[ci + 1]; s++) {
      const t = items[s];
      if (hitTris.has(t)) continue;
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const hit = rayTriangle(
        o[0], o[1], o[2], d[0], d[1], d[2],
        p[a], p[a + 1], p[a + 2],
        p[b], p[b + 1], p[b + 2],
        p[c], p[c + 1], p[c + 2]
      );
      if (hit) hitTris.add(t);
    }

    if (tMax[0] <= tMax[1] && tMax[0] <= tMax[2]) { cx += step[0]; tMax[0] += tDelta[0]; }
    else if (tMax[1] <= tMax[2]) { cy += step[1]; tMax[1] += tDelta[1]; }
    else { cz += step[2]; tMax[2] += tDelta[2]; }

    if (cx < 0 || cy < 0 || cz < 0 || cx >= dims[0] || cy >= dims[1] || cz >= dims[2]) break;
  }

  return hitTris.size;
}

// ---------------------------------------------------------------------------
// 肉厚：面の重心から内側へレイを飛ばし、反対側の壁までの距離を測る
//   全三角形は重いのでサンプリングする（薄い箇所は面積を持つので拾える）
// ---------------------------------------------------------------------------
export function analyzeThickness(
  mesh: Mesh,
  grid: Grid,
  opts: { sampleLimit?: number; thinThresholdMm?: number } = {}
): ThicknessReport {
  const sampleLimit = opts.sampleLimit ?? 3000;
  const thin = opts.thinThresholdMm ?? 0.8;
  const p = mesh.positions;
  const idx = mesh.indices;
  const total = triangleCount(mesh);
  if (total === 0) {
    return {
      minWallThicknessMm: null,
      rawMinWallThicknessMm: null,
      sampleCount: 0,
      thinFaceCount: 0,
      thinAreaRatio: 0,
    };
  }

  const stride = Math.max(1, Math.floor(total / sampleLimit));
  let min = Infinity;
  let sampled = 0;
  let thinFaceCount = 0;
  let totalArea = 0;
  let thinArea = 0;
  const samples: [number, number][] = []; // [厚み, その面の面積]

  // 面の凹凸や数値誤差をレイが拾わないよう、モデルサイズに対する相対の下限を置く
  const span = Math.max(grid.cell * grid.dims[0], grid.cell * grid.dims[1], grid.cell * grid.dims[2]);
  const eps = Math.max(span * 1e-5, 1e-3);

  for (let t = 0; t < total; t += stride) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    nx /= len; ny /= len; nz /= len;

    // 外側に少し出た点が材料の中なら、この面は内部の面（重なったパーツの境界）。
    // そこから測った距離は肉厚ではないので数えない。
    const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3;
    const outside = countCrossings(
      mesh, grid,
      [gx + nx * eps * 4, gy + ny * eps * 4, gz + nz * eps * 4],
      [nx, ny, nz]
    );
    if (outside % 2 === 1) continue;

    // 内向き（法線の逆）に飛ばす
    const ox = gx - nx * eps;
    const oy = gy - ny * eps;
    const oz = gz - nz * eps;

    const dist = castRay(mesh, grid, [ox, oy, oz], [-nx, -ny, -nz], t, eps, 0.5);
    sampled++;
    if (dist !== null) {
      if (dist < min) min = dist;
      // この三角形が代表する面積（サンプリング間隔ぶんを見込む）
      const area = (len / 2) * stride;
      samples.push([dist, area]);
      totalArea += area;
      if (dist < thin) {
        thinFaceCount++;
        thinArea += area;
      }
    }
  }

  if (samples.length === 0) {
    return {
      minWallThicknessMm: null,
      rawMinWallThicknessMm: null,
      sampleCount: sampled,
      thinFaceCount: 0,
      thinAreaRatio: 0,
    };
  }

  // 面積の下位1%にあたる厚みを「実用上の最小肉厚」とする
  samples.sort((a, b) => a[0] - b[0]);
  const cut = totalArea * 0.01;
  let acc = 0;
  let p1 = samples[0][0];
  for (const [d, a] of samples) {
    acc += a;
    p1 = d;
    if (acc >= cut) break;
  }

  return {
    minWallThicknessMm: p1,
    rawMinWallThicknessMm: Number.isFinite(min) ? min : null,
    sampleCount: sampled,
    thinFaceCount,
    thinAreaRatio: totalArea > 0 ? thinArea / totalArea : 0,
  };
}

// ---------------------------------------------------------------------------
// 自己交差：三角形の辺が別の三角形を貫いていないかを見る
// ---------------------------------------------------------------------------
function segmentHitsTriangle(
  p: Float64Array, idx: Uint32Array, ta: number, tb: number
): boolean {
  const A = [idx[ta * 3] * 3, idx[ta * 3 + 1] * 3, idx[ta * 3 + 2] * 3];
  const B = [idx[tb * 3] * 3, idx[tb * 3 + 1] * 3, idx[tb * 3 + 2] * 3];
  for (let e = 0; e < 3; e++) {
    const s = A[e], t = A[(e + 1) % 3];
    const dx = p[t] - p[s], dy = p[t + 1] - p[s + 1], dz = p[t + 2] - p[s + 2];
    const hit = rayTriangle(
      p[s], p[s + 1], p[s + 2], dx, dy, dz,
      p[B[0]], p[B[0] + 1], p[B[0] + 2],
      p[B[1]], p[B[1] + 1], p[B[1] + 2],
      p[B[2]], p[B[2] + 1], p[B[2] + 2]
    );
    if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) return true;
  }
  return false;
}

export function analyzeSelfIntersection(
  mesh: Mesh,
  grid: Grid,
  sampleLimit = 4000
): SelfIntersectionReport {
  const p = mesh.positions;
  const idx = mesh.indices;
  const total = triangleCount(mesh);
  if (total === 0) return { count: 0, sampleCount: 0, complete: true };

  const stride = Math.max(1, Math.floor(total / sampleLimit));
  const { min, cell, dims, starts, items } = grid;
  let count = 0;
  let sampled = 0;

  const shares = (ta: number, tb: number) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        if (idx[ta * 3 + i] === idx[tb * 3 + j]) return true;
    return false;
  };

  for (let t = 0; t < total; t += stride) {
    sampled++;
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const lo: number[] = [], hi: number[] = [];
    for (let k = 0; k < 3; k++) {
      const v0 = p[a + k], v1 = p[b + k], v2 = p[c + k];
      lo.push(Math.max(0, Math.floor((Math.min(v0, v1, v2) - min[k]) / cell)));
      hi.push(Math.min(dims[k] - 1, Math.floor((Math.max(v0, v1, v2) - min[k]) / cell)));
    }

    let found = false;
    const checked = new Set<number>();
    for (let z = lo[2]; z <= hi[2] && !found; z++)
      for (let y = lo[1]; y <= hi[1] && !found; y++)
        for (let x = lo[0]; x <= hi[0] && !found; x++) {
          const ci = x + dims[0] * (y + dims[1] * z);
          for (let s = starts[ci]; s < starts[ci + 1]; s++) {
            const o = items[s];
            if (o === t || checked.has(o)) continue;
            checked.add(o);
            if (shares(t, o)) continue;
            if (segmentHitsTriangle(p, idx, t, o) || segmentHitsTriangle(p, idx, o, t)) {
              found = true;
              break;
            }
          }
        }
    if (found) count++;
  }

  return { count, sampleCount: sampled, complete: stride === 1 };
}

// ---------------------------------------------------------------------------
export function analyzeMesh(
  mesh: Mesh,
  opts: { thicknessSamples?: number; selfIntersectionSamples?: number } = {}
): MeshAnalysis {
  const welded = weldVertices(mesh);
  const weldedMesh: Mesh = {
    positions: welded.positions,
    indices: welded.indices,
    materialIndices: mesh.materialIndices,
  };
  const grid = buildGrid(weldedMesh);

  return {
    triangleCount: triangleCount(mesh),
    topology: analyzeTopology(welded),
    geometry: analyzeGeometry(weldedMesh),
    thickness: analyzeThickness(weldedMesh, grid, { sampleLimit: opts.thicknessSamples }),
    selfIntersection: analyzeSelfIntersection(weldedMesh, grid, opts.selfIntersectionSamples),
  };
}

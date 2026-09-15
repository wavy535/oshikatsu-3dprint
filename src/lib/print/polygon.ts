import { MODEL_LIMITS } from "./limits.ts";

// 多角形の面（頂点番号の列）を三角形に分ける。
// 凹んだ多角形（窓の周りの壁など）でも面の外に三角形がはみ出ないよう、面の平面に投影して耳切り法で分ける。

const TRIANGLE_CORNERS = 3;

type Point = { u: number; v: number };

// 2D の三角形の面積の2倍（反時計回りなら正）
const area2 = (a: Point, b: Point, c: Point) => (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);

// p が三角形 abc（反時計回り）の内側か辺の上にあるか
const insideOrOnEdge = (p: Point, a: Point, b: Point, c: Point) =>
  area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;

const samePoint = (p: Point, q: Point) => p.u === q.u && p.v === q.v;

// 多角形の法線（Newell 法）が一番大きい軸を落として 2D にし、反時計回りになるよう向きをそろえる
function project(positions: Float64Array, corners: ArrayLike<number>): Point[] | null {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[i] * 3;
    const b = corners[(i + 1) % n] * 3;
    nx += (positions[a + 1] - positions[b + 1]) * (positions[a + 2] + positions[b + 2]);
    ny += (positions[a + 2] - positions[b + 2]) * (positions[a] + positions[b]);
    nz += (positions[a] - positions[b]) * (positions[a + 1] + positions[b + 1]);
  }
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax === 0 && ay === 0 && az === 0) return null;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = corners[i] * 3;
    const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];
    if (az >= ax && az >= ay) points.push(nz > 0 ? { u: x, v: y } : { u: y, v: x });
    else if (ax >= ay) points.push(nx > 0 ? { u: y, v: z } : { u: z, v: y });
    else points.push(ny > 0 ? { u: z, v: x } : { u: x, v: z });
  }
  return points;
}

function fan(corners: ArrayLike<number>, order: number[], out: number[]) {
  for (let i = 1; i + 1 < order.length; i++) out.push(corners[order[0]], corners[order[i]], corners[order[i + 1]]);
}

/**
 * 面の頂点番号の列（corners、元の向きの順）を三角形に分けて out に足す。三角形も元の面と同じ向きになる。
 * 平面に投影できない面・耳が見つからない面・角が多すぎる面は、扇形に分ける。
 */
export function triangulatePolygon(positions: Float64Array, corners: ArrayLike<number>, out: number[]) {
  const n = corners.length;
  if (n < TRIANGLE_CORNERS) return;
  const order = Array.from({ length: n }, (_, i) => i);
  if (n === TRIANGLE_CORNERS || n > MODEL_LIMITS.earClippingCorners) return fan(corners, order, out);
  const points = project(positions, corners);
  if (!points) return fan(corners, order, out);

  while (order.length > TRIANGLE_CORNERS) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const prev = order[(i + order.length - 1) % order.length];
      const current = order[i];
      const next = order[(i + 1) % order.length];
      const [a, b, c] = [points[prev], points[current], points[next]];
      if (area2(a, b, c) <= 0) continue;
      const blocked = order.some(
        (k) =>
          k !== prev &&
          k !== current &&
          k !== next &&
          !samePoint(points[k], a) &&
          !samePoint(points[k], b) &&
          !samePoint(points[k], c) &&
          insideOrOnEdge(points[k], a, b, c),
      );
      if (blocked) continue;
      out.push(corners[prev], corners[current], corners[next]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return fan(corners, order, out);
  }
  fan(corners, order, out);
}

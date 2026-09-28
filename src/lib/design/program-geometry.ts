import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { runModelScript, scriptNumber, type ScriptValue, type ModelApi } from "./model-script.ts";
import { CompositeGeometryError } from "./composite.ts";
type Vec3 = [number, number, number];

/** Only numeric handles cross the interpreter boundary; WASM objects remain private. */
export function buildProgram(module: ManifoldToplevel, source: string, envelope: Vec3, own: <T extends Manifold | CrossSection>(v: T) => T): Manifold {
  const handles = new Map<number, Manifold>();
  let next = 1, totalTriangles = 0;
  const error = (s: string): never => { throw new Error(s); };
  const num = (v: ScriptValue | undefined, min = -400, max = 400) => { const n = scriptNumber(v); if (n < min || n > max) return error(`数値は${min}〜${max}です。`); return n; };
  const list = (v: ScriptValue | undefined, min = 1, max = 1024): ScriptValue[] => { if (!Array.isArray(v) || v.length < min || v.length > max) return error(`配列は${min}〜${max}要素です。`); return v; };
  const vec = (v: ScriptValue | undefined): Vec3 => list(v, 3, 3).map((n) => num(n)) as Vec3;
  const get = (v: ScriptValue | undefined) => handles.get(scriptNumber(v)) ?? error("立体の参照が不正です。");
  const keep = (s: Manifold) => {
    own(s);
    if (s.status() !== "NoError") return error(`形状が不正です: ${s.status()}`);
    const count = s.numTri(); totalTriangles += count;
    if (next > 384 || count > 30000 || totalTriangles > 600000) return error("形状の計算上限を超えました。分割数や装飾を減らしてください。");
    const id = next++; handles.set(id, s); return id;
  };
  const api: ModelApi = {
    box: (size) => { const s = vec(size); s.forEach((x) => num(x, 0.2, 200)); return keep(module.Manifold.cube(s)); },
    sphere: (radius) => keep(module.Manifold.sphere(num(radius, 0.2, 100), 24)),
    cylinder: (height, radius) => keep(module.Manifold.cylinder(num(height, 0.2, 200), num(radius, 0.2, 100), undefined, 32)),
    move: (id, offset) => keep(get(id).translate(vec(offset))),
    rotate: (id, angles) => keep(get(id).rotate(vec(angles))),
    scale: (id, factors) => { const f = vec(factors); f.forEach((x) => num(x, 0.01, 100)); return keep(get(id).scale(f)); },
    union: (...ids) => { let result = get(ids[0]); for (const id of ids.slice(1)) result = get(keep(result.add(get(id)))); return keep(result); },
    subtract: (a, b) => keep(get(a).subtract(get(b))),
    intersect: (a, b) => keep(get(a).intersect(get(b))),
    extrude: (points, height) => {
      const polygon = list(points, 3, 256).map((p) => list(p, 2, 2).map((n) => num(n)) as [number, number]);
      return keep(own(new module.CrossSection(polygon)).extrude(num(height, 0.2, 200)));
    },
    revolve: (points) => {
      const polygon = list(points, 3, 256).map((p) => list(p, 2, 2).map((n) => num(n)) as [number, number]);
      return keep(own(new module.CrossSection(polygon)).revolve(48));
    },
    mesh: (vertices, faces) => {
      const vs = list(vertices, 4, 4096).map(vec);
      const fs = list(faces, 4, 8192).map((f) => list(f, 3, 3).map((i) => { const n = num(i, 0, vs.length - 1); if (!Number.isInteger(n)) return error("面の頂点番号は整数です。"); return n; }));
      return keep(new module.Manifold(new module.Mesh({ numProp: 3, vertProperties: new Float32Array(vs.flat()), triVerts: new Uint32Array(fs.flat()) })));
    },
    // Loft connects equally sized CCW XY rings; first/last caps use a fan.
    // Rings must be convex/star-shaped around their average, and progress upward.
    loft: (rings) => {
      const rs = list(rings, 2, 64).map((r) => list(r, 3, 64).map(vec));
      const k = rs[0].length;
      if (rs.some((r) => r.length !== k)) return error("loftの輪郭の頂点数を揃えてください。");
      const vs = rs.flat(), fs: number[] = [];
      for (let j = 0; j < rs.length - 1; j++) for (let i = 0; i < k; i++) {
        const a = j * k + i, b = j * k + (i + 1) % k, c = b + k, d = a + k;
        fs.push(a, b, c, a, c, d);
      }
      for (const end of [0, rs.length - 1]) {
        const ring = rs[end], center = [0, 1, 2].map((axis) => ring.reduce((s, p) => s + p[axis], 0) / k) as Vec3;
        const c = vs.length; vs.push(center);
        for (let i = 0; i < k; i++) { const a = end * k + i, b = end * k + (i + 1) % k; fs.push(...(end === 0 ? [c, b, a] : [c, a, b])); }
      }
      return keep(new module.Manifold(new module.Mesh({ numProp: 3, vertProperties: new Float32Array(vs.flat()), triVerts: new Uint32Array(fs) })));
    },
    // Circular sections around an arbitrary sampled curve. Hull each pair of
    // balls, then union; supports scrollwork without demanding a triangle soup.
    tube: (points, radius) => {
      const ps = list(points, 2, 64).map(vec), r = num(radius, 0.5, 20);
      const ball = own(module.Manifold.sphere(r, 12));
      let result: Manifold | undefined;
      for (let i = 0; i < ps.length - 1; i++) {
        const a = own(ball.translate(ps[i])), b = own(ball.translate(ps[i + 1]));
        const segment = own(module.Manifold.hull([a, b]));
        const id = keep(result ? result.add(segment) : segment); result = get(id);
      }
      return keep(result!);
    },
  };
  try {
    const result = get(runModelScript(source, api));
    if (result.isEmpty() || result.volume() < 0.001) error("立体が空です。厚みを持たせてください。");
    const pieces = result.decompose(); pieces.forEach(own);
    if (pieces.length !== 1) error("形が分離しています。装飾と本体を体積が重なるようにつないでください。");
    const bounds = result.boundingBox();
    if (bounds.max.some((v, i) => v - bounds.min[i] > envelope[i] + 0.01 || v - bounds.min[i] < 0.2)) error("実寸が宣言したsizeを超えるか、厚みがありません。コードとsizeを修正してください。");
    return own(result.translate(bounds.min.map((v) => -v) as Vec3));
  } catch (e) { throw new CompositeGeometryError(e instanceof Error ? e.message : "自由形状を生成できませんでした。"); }
}

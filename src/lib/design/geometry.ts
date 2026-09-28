import { buildProgram } from "./program-geometry.ts";
import { CompositeGeometryError } from "./composite.ts";
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { checkDesign, parseDesign, type Design, type Issue } from "./document.ts";
import { designParts, type PartSpec, type Shape, type Vector } from "./parts.ts";

export type PartMesh = PartSpec & { positions: Float32Array; indices: Uint32Array; volume: number; printSize: Vector };
export type DesignBuild = { parts: PartMesh[]; issues: Issue[]; milliseconds: number };

/** Rotation agrees with Manifold's Euler convention for our single-axis print rotations. */
export function rotatePoint(p: Vector, degrees: Vector): Vector {
  let [x, y, z] = p;
  for (let axis = 0; axis < 3; axis++) {
    const a = degrees[axis] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (axis === 0) [y, z] = [c * y - s * z, s * y + c * z];
    if (axis === 1) [x, z] = [c * x + s * z, -s * x + c * z];
    if (axis === 2) [x, y] = [c * x - s * y, s * x + c * y];
  }
  return [x, y, z];
}

export function printPositions(part: Pick<PartMesh, "positions" | "printRotation">): Float32Array {
  const out = new Float32Array(part.positions.length);
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < out.length; i += 3) {
    const p = rotatePoint([part.positions[i], part.positions[i + 1], part.positions[i + 2]], part.printRotation);
    out.set(p, i);
    p.forEach((v, k) => { min[k] = Math.min(min[k], v); });
  }
  for (let i = 0; i < out.length; i++) out[i] -= min[i % 3];
  return out;
}

function makeShape(module: ManifoldToplevel, shape: Shape) {
  // Own every intermediate WASM object, including failed operations.
  const owned = new Set<Manifold | CrossSection>();
  const own = <T extends Manifold | CrossSection>(x: T): T => { owned.add(x); return x; };
  const cube = (size: Vector) => own(module.Manifold.cube(size));
  try {
    let solid: Manifold;
    if (shape.kind === "program") {
      solid = buildProgram(module, shape.source, shape.size, own);
    } else if (shape.kind === "composite") {
      let result: Manifold | undefined;
      for (const step of shape.steps) {
        const s = step.size, c = step.center, r = step.rotation;
        let primitive = step.primitive === "box" ? own(module.Manifold.cube([s.x, s.y, s.z], true))
          : step.primitive === "cylinder" ? own(own(module.Manifold.cylinder(s.z, 1, 1, 48, true)).scale([s.x / 2, s.y / 2, 1]))
          : own(own(module.Manifold.sphere(1, 32)).scale([s.x / 2, s.y / 2, s.z / 2]));
        primitive = own(own(primitive.rotate([r.x, r.y, r.z])).translate([c.x, c.y, c.z]));
        result = result ? own(step.operation === "add" ? result.add(primitive) : result.subtract(primitive)) : primitive;
        if (result.numTri() > 20000) throw new CompositeGeometryError("複合部品が複雑すぎます。形の数や重なりを減らしてください。");
      }
      if (!result || result.isEmpty() || result.status() !== "NoError" || result.volume() < 0.001)
        throw new CompositeGeometryError("複合部品が空です。差し引く形を小さくし、残る立体を作ってください。");
      const pieces = result.decompose(); pieces.forEach(own);
      if (pieces.length !== 1) throw new CompositeGeometryError("複合部品が分離しています。加える形を重ねて、1つにつながるよう修正してください。");
      const { min } = result.boundingBox();
      solid = own(result.translate(min.map((v) => -v) as Vector));
    } else if (shape.kind === "roof") {
      const { width: w, depth: d, rise: r, thickness: t, side } = shape;
      const dz = t * Math.hypot(w, r) / w;
      const low = side === "left" ? 0 : r, high = side === "left" ? r : 0;
      const section = own(new module.CrossSection([[0, low], [w, high], [w, high + dz], [0, low + dz]]));
      const extruded = own(section.extrude(d));
      solid = own(own(extruded.rotate([90, 0, 0])).translate([0, d, 0]));
    } else {
      solid = cube(shape.size);
      const [w, d, h] = shape.size;
      if (shape.kind === "wall") {
        const [ow, oh] = shape.opening;
        const hole = shape.openingShape === "ellipse"
          ? own(own(own(own(module.Manifold.cylinder(d + 2, 1, 1, 64)).scale([ow / 2, oh / 2, 1])).rotate([90, 0, 0])).translate([w / 2, d + 1, h / 2]))
          : own(cube([ow, d + 2, oh]).translate([(w - ow) / 2, -1, (h - oh) / 2]));
        solid = own(solid.subtract(hole));
      } else if (shape.kind === "cylinder") {
        solid = own(own(own(module.Manifold.cylinder(h, 1, 1, 64)).scale([w / 2, d / 2, 1])).translate([w / 2, d / 2, 0]));
      } else if (shape.kind === "table") {
        const t = shape.thickness;
        const acrossX = own(cube([w - 2 * t, d + 2, h - t + 1]).translate([t, -1, -1]));
        const acrossY = own(cube([w + 2, d - 2 * t, h - t + 1]).translate([-1, t, -1]));
        solid = own(own(solid.subtract(acrossX)).subtract(acrossY));
      } else if (shape.kind === "shelf") {
        const t = shape.thickness;
        // One open cubby, printed on its back. Top, bottom and sides are connected.
        const hole = own(cube([w - 2 * t, d + 2, h - 2 * t]).translate([t, -1, t]));
        solid = own(solid.subtract(hole));
      }
    }
    if (solid.status() !== "NoError" || solid.isEmpty()) throw new Error("部品の形状を生成できませんでした。");
    const mesh = solid.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let v = 0; v < mesh.numVert; v++) for (let k = 0; k < 3; k++) positions[3 * v + k] = mesh.vertProperties[v * mesh.numProp + k];
    return { positions, indices: mesh.triVerts.slice(), volume: solid.volume() };
  } finally { for (const object of [...owned].reverse()) object.delete(); }
}

/** Cache geometry only: color, placement and nui measurements do not invalidate it. */
export function createGeometryEngine(module: ManifoldToplevel) {
  const cache = new Map<string, ReturnType<typeof makeShape>>();
  return {
    build(value: unknown): DesignBuild {
      const start = performance.now();
      const design: Design = parseDesign(value);
      const issues = checkDesign(design);
      const parts = designParts(design).map((spec): PartMesh => {
        const key = JSON.stringify(spec.shape);
        let mesh = cache.get(key);
        if (!mesh) {
          try { mesh = makeShape(module, spec.shape); }
          catch (error) {
            if (error instanceof CompositeGeometryError) throw new CompositeGeometryError(`${spec.id}: ${error.message}`);
            throw error;
          }
          cache.set(key, mesh);
          if (cache.size > 32) cache.delete(cache.keys().next().value!);
        }
        // The worker transfers these copies; cached buffers stay owned by the engine.
        const part = { ...spec, positions: mesh.positions.slice(), indices: mesh.indices.slice(), volume: mesh.volume, printSize: [0, 0, 0] as Vector };
        const flat = printPositions(part);
        for (let i = 0; i < flat.length; i++) part.printSize[i % 3] = Math.max(part.printSize[i % 3], flat[i]);
        const [x, y, z] = part.printSize, b = design.bed;
        if (!((x <= b.width + 0.001 && y <= b.depth + 0.001) || (y <= b.width + 0.001 && x <= b.depth + 0.001)) || z > b.height + 0.001)
          issues.push({ code: `bed-${spec.id}`, level: "error", message: `${spec.label}が指定したプリンタの造形範囲に収まりません。` });
        return part;
      });
      return { parts, issues, milliseconds: performance.now() - start };
    },
    clear() { cache.clear(); },
  };
}

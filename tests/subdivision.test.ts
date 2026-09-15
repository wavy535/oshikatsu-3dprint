import { expect, test } from "vitest";
import { AnalysisBudget } from "@/lib/print/limits";
import { catmullClark, type PolyMesh } from "@/lib/print/subdivision";
import { cubeMesh } from "./helpers/blend-files";

function toPolyMesh(mesh: { positions: readonly number[]; faces: readonly (readonly number[])[] }): PolyMesh {
  const offsets = [0];
  for (const face of mesh.faces) offsets.push(offsets[offsets.length - 1] + face.length);
  return {
    positions: Float64Array.from(mesh.positions),
    faceOffsets: Int32Array.from(offsets),
    cornerVerts: Int32Array.from(mesh.faces.flat()),
  };
}

const vertex = (mesh: PolyMesh, index: number) => [...mesh.positions.subarray(index * 3, index * 3 + 3)];
const run = (mesh: PolyMesh, levels: number, limitSurface: boolean, preserveCorners = false) =>
  catmullClark(mesh, { levels, limitSurface, preserveCorners, budget: new AnalysisBudget() });

// Original vertices keep their numbers at every level; vertex 6 is the cube corner (1, 1, 1).
const CORNER = 6;

test("one step on a cube gives the textbook Catmull-Clark points", () => {
  const out = run(toPolyMesh(cubeMesh()), 1, false);
  expect(out.faceOffsets.length - 1).toBe(24);
  expect(out.positions.length / 3).toBe(8 + 12 + 6);
  for (const value of vertex(out, CORNER)) expect(value).toBeCloseTo(5 / 9, 12);
  const points = Array.from({ length: out.positions.length / 3 }, (_, i) => vertex(out, i).map((v) => Math.round(v * 1e9) / 1e9));
  // Edge point of the edge (1,1,-1)-(1,1,1) and the face point of the +Z face.
  expect(points).toContainEqual([0.75, 0.75, 0]);
  expect(points).toContainEqual([0, 0, 1]);
});

test("limit positions do not change with the level they are computed from, and match deep subdivision", () => {
  const cube = toPolyMesh(cubeMesh());
  const limit = vertex(run(cube, 1, true), CORNER);
  for (const [a, b] of limit.map((value, k) => [value, vertex(run(cube, 3, true), CORNER)[k]])) expect(a).toBeCloseTo(b, 12);
  // Six recursive steps converge to within 1e-5 of the limit (measured 7.1e-6).
  for (const [a, b] of limit.map((value, k) => [value, vertex(run(cube, 6, false), CORNER)[k]])) expect(Math.abs(a - b)).toBeLessThan(1e-5);
  expect(limit[0]).toBeCloseTo(0.5, 12);
});

test("faces keep their outward winding after subdivision", () => {
  const out = run(toPolyMesh(cubeMesh()), 2, true);
  for (let f = 0; f < out.faceOffsets.length - 1; f++) {
    const [a, b, c] = [0, 1, 2].map((i) => vertex(out, out.cornerVerts[out.faceOffsets[f] + i]));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    // On a convex closed surface around the origin, outward normals point away from the centre.
    expect(normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2]).toBeGreaterThan(0);
  }
});

test("open boundaries use the crease rules, and corners stay put only when they are preserved", () => {
  // A 2 x 2 grid of quads in the XY plane: vertex 0 is a corner (one face), vertex 1 is on the boundary.
  const grid = toPolyMesh({
    positions: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 0, 0, 2, 0, 1, 2, 0, 2, 2, 0],
    faces: [
      [0, 1, 4, 3],
      [1, 2, 5, 4],
      [3, 4, 7, 6],
      [4, 5, 8, 7],
    ],
  });
  const kept = run(grid, 1, false, true);
  expect(vertex(kept, 0)).toEqual([0, 0, 0]);
  // Boundary vertex (1,0): (6P + left + right) / 8 = (6·(1,0) + (0,0) + (2,0)) / 8 = (1, 0)
  expect(vertex(kept, 1)).toEqual([1, 0, 0]);
  const smoothed = run(grid, 1, false, false);
  // Smooth corner (0,0) with boundary neighbours (1,0) and (0,1): (1/8, 1/8)
  expect(vertex(smoothed, 0)).toEqual([0.125, 0.125, 0]);
  // Boundary limit: (left + 4P + right) / 6
  expect(vertex(run(grid, 1, true, false), 1)).toEqual([1, 0, 0]);
});

test("zero levels return the mesh unchanged", () => {
  const cube = toPolyMesh(cubeMesh());
  expect(run(cube, 0, true)).toBe(cube);
});

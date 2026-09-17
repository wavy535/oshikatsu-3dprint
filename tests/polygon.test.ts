import { expect, test } from "vitest";
import { MODEL_LIMITS } from "@/lib/print/limits";
import { triangulatePolygon } from "@/lib/print/polygon";

function triangleNormals(positions: Float64Array, indices: number[]) {
  const normals: number[][] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => [...positions.subarray(i * 3, i * 3 + 3)]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    normals.push([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  }
  return normals;
}

const area = (normals: number[][]) => normals.reduce((sum, n) => sum + Math.hypot(n[0], n[1], n[2]) / 2, 0);

// An L shape (area 3) counter-clockwise in the XY plane; vertex 3 is the reflex corner.
const L_SHAPE = [0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0];

test("a concave polygon is split into triangles that stay inside it and keep its orientation", () => {
  const positions = Float64Array.from(L_SHAPE);
  const out: number[] = [];
  triangulatePolygon(positions, [0, 1, 2, 3, 4, 5], out);
  expect(out).toHaveLength(12);
  const normals = triangleNormals(positions, out);
  expect(area(normals)).toBeCloseTo(3, 12);
  for (const n of normals) expect(n[2]).toBeGreaterThan(0);
});

test("polygons in other planes and with the opposite winding are handled the same way", () => {
  // The same L shape in the YZ plane, listed clockwise when seen from +X.
  const positions = Float64Array.from(
    Array.from({ length: 6 }, (_, i) => [5, L_SHAPE[i * 3], L_SHAPE[i * 3 + 1]]).flat(),
  );
  const out: number[] = [];
  triangulatePolygon(positions, [5, 4, 3, 2, 1, 0], out);
  const normals = triangleNormals(positions, out);
  expect(area(normals)).toBeCloseTo(3, 12);
  for (const n of normals) expect(n[0]).toBeLessThan(0);
});

test("triangles pass through, and degenerate or very large polygons fall back to a fan", () => {
  const positions = Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const triangle: number[] = [];
  triangulatePolygon(positions, [0, 1, 2], triangle);
  expect(triangle).toEqual([0, 1, 2]);

  const collinear = Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
  const fan: number[] = [];
  triangulatePolygon(collinear, [0, 1, 2, 3], fan);
  expect(fan).toEqual([0, 1, 2, 0, 2, 3]);

  const corners = MODEL_LIMITS.earClippingCorners + 1;
  const circle = Float64Array.from(
    Array.from({ length: corners }, (_, i) => [Math.cos((2 * Math.PI * i) / corners), Math.sin((2 * Math.PI * i) / corners), 0]).flat(),
  );
  const big: number[] = [];
  triangulatePolygon(circle, Array.from({ length: corners }, (_, i) => i), big);
  expect(big).toHaveLength((corners - 2) * 3);
  expect(big.slice(0, 3)).toEqual([0, 1, 2]);
});

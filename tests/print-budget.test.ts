import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import {
  analyzeMesh,
  analyzeTopology,
  weldVertices,
} from "@/lib/print/analyze";
import { parseStl } from "@/lib/print/stl";
import {
  AnalysisBudget,
  MODEL_LIMITS,
  ModelLimitError,
} from "@/lib/print/limits";
import type { Mesh } from "@/lib/print/mesh";

const tetrahedron = parseStl(
  readFileSync(new URL("./fixtures/tetrahedron.stl", import.meta.url)),
).objects[0].mesh;
afterEach(() => vi.restoreAllMocks());

test("topology retains holes, reversed winding and duplicate-face detection", () => {
  const w = weldVertices(tetrahedron);
  expect(analyzeTopology(w)).toMatchObject({
    isManifold: true,
    openEdgeCount: 0,
    flippedNormalCount: 0,
  });
  expect(
    analyzeTopology({ ...w, indices: w.indices.slice(0, -3) }),
  ).toMatchObject({ isManifold: false, openEdgeCount: 3 });
  const flipped = w.indices.slice();
  [flipped[0], flipped[1]] = [flipped[1], flipped[0]];
  expect(
    analyzeTopology({ ...w, indices: flipped }).flippedNormalCount,
  ).toBeGreaterThan(0);
  const duplicated = new Uint32Array([...w.indices, ...w.indices.slice(0, 3)]);
  expect(analyzeTopology({ ...w, indices: duplicated })).toMatchObject({
    duplicateTriangleCount: 1,
    nonManifoldEdgeCount: 3,
  });
});

test("sample limits are upper bounds even when face counts do not divide evenly", () => {
  const result = analyzeMesh(tetrahedron, {
    selfIntersectionSamples: 3,
    thicknessSamples: 3,
  });
  expect(result.selfIntersection.sampleCount).toBeLessThanOrEqual(3);
  expect(result.selfIntersection.complete).toBe(false);
  expect(result.thickness.sampleCount).toBeLessThanOrEqual(3);
  expect(() => analyzeMesh(tetrahedron, { thicknessSamples: 0 })).toThrow(
    /サンプル数/,
  );
  expect(() =>
    analyzeMesh(tetrahedron, { selfIntersectionSamples: Infinity }),
  ).toThrow(/サンプル数/);
});

test("large overlapping faces cannot allocate an unbounded spatial grid", () => {
  const mesh: Mesh = {
    positions: new Float64Array([-10, -10, -10, 10, 10, -10, 0, 0, 10]),
    indices: Uint32Array.from({ length: 5000 * 3 }, (_, i) => i % 3),
    materialIndices: null,
  };
  expect(() => analyzeMesh(mesh)).toThrow(/面の重なり/);
});

test("candidate and time budgets cover all parts of the same analysis", () => {
  const budget = new AnalysisBudget();
  budget.visit(MODEL_LIMITS.candidateVisits);
  expect(() => analyzeMesh(tetrahedron, {}, budget)).toThrow(ModelLimitError);
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const expired = new AnalysisBudget();
  clock.mockReturnValue(MODEL_LIMITS.analysisMs + 1);
  expect(() => analyzeMesh(tetrahedron, {}, expired)).toThrow(/解析時間/);
});

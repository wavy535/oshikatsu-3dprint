import { beforeAll, expect, test } from "vitest";
import Module from "manifold-3d";
import { defaultDesign } from "../src/lib/design/document";
import {
  createGeometryEngine,
  printPositions,
} from "../src/lib/design/geometry";
import { exportDesign } from "../src/lib/design/export";
import type { CubicSegment } from "../src/lib/design/bezier-contour";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => {
  const wasm = await Module();
  wasm.setup();
  engine = createGeometryEngine(wasm);
});

function circle(radius: number): CubicSegment[] {
  const r = radius,
    k = r * 0.5522847498;
  return [
    [
      [10 + r, 10],
      [10 + r, 10 + k],
      [10 + k, 10 + r],
      [10, 10 + r],
    ],
    [
      [10, 10 + r],
      [10 - k, 10 + r],
      [10 - r, 10 + k],
      [10 - r, 10],
    ],
    [
      [10 - r, 10],
      [10 - r, 10 - k],
      [10 - k, 10 - r],
      [10, 10 - r],
    ],
    [
      [10, 10 - r],
      [10 + k, 10 - r],
      [10 + r, 10 - k],
      [10 + r, 10],
    ],
  ];
}
function build(source: string) {
  const design = defaultDesign();
  design.scene = "object";
  design.programs = [
    {
      id: "model-1",
      name: "曲線の飾り",
      color: "#999999",
      x: 0,
      y: 0,
      size: [20, 20, 4],
      source,
    },
  ];
  return { design, built: engine.build(design) };
}

test("closed cubic contours produce bounded smooth solids in either winding direction", () => {
  const curves = circle(10);
  const reverse = curves.toReversed().map((segment) => segment.toReversed());
  const first = build(`return bezierExtrude(${JSON.stringify(curves)},4);`)
    .built.parts[0];
  const second = build(`return bezierExtrude(${JSON.stringify(reverse)},4);`)
    .built.parts[0];
  expect(first.printSize).toEqual([20, 20, 4]);
  expect(second.printSize).toEqual(first.printSize);
  expect(second.volume).toBeCloseTo(first.volume, 4);
  expect(Math.abs(first.volume / (Math.PI * 100 * 4) - 1)).toBeLessThan(0.005);
  expect(Math.min(...printPositions(first))).toBeGreaterThanOrEqual(0);
});

test("a curved hole remains open in a connected closed mesh and exported geometry", () => {
  const source = `const outer=bezierExtrude(${JSON.stringify(circle(10))},4);const inner=move(bezierExtrude(${JSON.stringify(circle(4))},6),[0,0,-1]);return subtract(outer,inner);`;
  const { design, built } = build(source);
  const mesh = built.parts[0];
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3)
    for (let edge = 0; edge < 3; edge++) {
      const key = [
        mesh.indices[index + edge],
        mesh.indices[index + ((edge + 1) % 3)],
      ]
        .sort((a, b) => a - b)
        .join(":");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  expect([...edges.values()].every((count) => count === 2)).toBe(true);
  expect(mesh.positions.length / 3 - edges.size + mesh.indices.length / 3).toBe(
    0,
  );
  expect(Math.abs(mesh.volume / (Math.PI * 84 * 4) - 1)).toBeLessThan(0.005);
  expect(exportDesign(design, built, "3mf").length).toBeGreaterThan(1000);
  expect(exportDesign(design, built, "glb").length).toBeGreaterThan(1000);
});

test.each([
  "return bezierExtrude([],4);",
  "return bezierExtrude([[[0,0],[1,1],[2,2],[3,3]]],4);",
  "return bezierExtrude([[[0,0],[1,0],[2,0],[3,0]],[[4,0],[4,4],[0,4],[0,0]]],4);",
  `return bezierExtrude(${JSON.stringify(circle(10))},-1);`,
  `return bezierExtrude(${JSON.stringify(Array.from({ length: 17 }, () => circle(10)[0]))},4);`,
  "return bezierExtrude([[[0,0],[1,1],[2,2],[3,3]],[[3,3],[2,2],[1,1],[0,0]]],4);",
])(
  "rejects open, degenerate, or excessive paths before changing the design: %s",
  (source) => {
    expect(() => build(source)).toThrow();
  },
);

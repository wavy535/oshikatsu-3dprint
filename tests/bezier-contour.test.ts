import { beforeAll, expect, test } from "vitest";
import Module from "manifold-3d";
import { defaultDesign } from "../src/lib/design/document";
import {
  createGeometryEngine,
  printPositions,
} from "../src/lib/design/geometry";
import {
  sampleBezierContour,
  type CubicSegment,
  type Point2,
} from "../src/lib/design/bezier-contour";

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
function circleWithPoint(segment: number, point: number, value: number[]) {
  const curves: number[][][] = circle(10);
  curves[segment][point] = value;
  return curves;
}

function polygon(sides: number): CubicSegment[] {
  const vertices: Point2[] = Array.from({ length: sides }, (_, i) => [
    10 + 10 * Math.cos((i * 2 * Math.PI) / sides),
    10 + 10 * Math.sin((i * 2 * Math.PI) / sides),
  ]);
  return vertices.map((start, i) => {
    const end = vertices[(i + 1) % sides];
    return [start, start, end, end];
  });
}

function build(source: string, height = 4) {
  const design = defaultDesign();
  design.scene = "object";
  design.programs = [
    {
      id: "model-1",
      name: "曲線の飾り",
      color: "#999999",
      x: 0,
      y: 0,
      size: [20, 20, Math.max(2, height)],
      source,
    },
  ];
  return engine.build(design);
}

test("two cubic segments preserve both control points and negative coordinates", () => {
  const curves: CubicSegment[] = [
    [
      [0, 0],
      [0, 12],
      [20, 12],
      [20, 0],
    ],
    [
      [20, 0],
      [20, -4],
      [0, -4],
      [0, 0],
    ],
  ];
  const points = sampleBezierContour(curves);
  // At t=1/2 the upper and lower curves reach y=9 and y=-3.
  expect(points).toContainEqual([10, 9]);
  expect(points).toContainEqual([10, -3]);
  expect(points).toHaveLength(32);
  const mesh = build(`return bezierExtrude(${JSON.stringify(curves)},4);`)
    .parts[0];
  expect(mesh.printSize).toEqual([20, 12, 4]);
  // The analytic area is 144 + 48 = 192 mm²; 16 chords per cubic must
  // approximate its extrusion within 1%, while the extrema remain exact.
  expect(Math.abs(mesh.volume / (192 * 4) - 1)).toBeLessThan(0.01);
});

test("all sixteen allowed segments reach the interpreter and stay within the sampling budget", () => {
  const curves = polygon(16);
  expect(sampleBezierContour(curves)).toHaveLength(256);
  const built = build(`return bezierExtrude(${JSON.stringify(curves)},4);`);
  expect(built.issues.filter((issue) => issue.level === "error")).toEqual([]);
  // These straight cubic segments enclose a regular hexadecagon, not a circle.
  const area = 8 * 100 * Math.sin(Math.PI / 8);
  expect(built.parts[0].volume).toBeCloseTo(area * 4, 3);
});

test("closed cubic contours produce bounded smooth solids in either winding direction", () => {
  const curves = circle(10);
  const reverse = curves.toReversed().map((segment) => segment.toReversed());
  const first = build(`return bezierExtrude(${JSON.stringify(curves)},4);`)
    .parts[0];
  const second = build(`return bezierExtrude(${JSON.stringify(reverse)},4);`)
    .parts[0];
  expect(first.printSize).toEqual([20, 20, 4]);
  expect(second.printSize).toEqual(first.printSize);
  expect(second.volume).toBeCloseTo(first.volume, 4);
  expect(Math.abs(first.volume / (Math.PI * 100 * 4) - 1)).toBeLessThan(0.005);
  expect(Math.min(...printPositions(first))).toBeGreaterThanOrEqual(0);
});

test("a curved hole remains open in a closed mesh with the expected material volume", () => {
  const source = `const outer=bezierExtrude(${JSON.stringify(circle(10))},4);const inner=move(bezierExtrude(${JSON.stringify(circle(4))},6),[0,0,-1]);return subtract(outer,inner);`;
  const built = build(source);
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
});

test.each([0.2, 200])(
  "accepts the extrusion height boundary %s mm",
  (height) => {
    const built = build(
      `return bezierExtrude(${JSON.stringify(circle(10))},${height});`,
      height,
    );
    expect(built.parts[0].printSize[2]).toBeCloseTo(height, 5);
  },
);

test.each([
  ["no segments", [], "配列は2〜16要素"],
  ["one segment", circle(10).slice(0, 1), "配列は2〜16要素"],
  ["seventeen closed segments", polygon(17), "配列は2〜16要素"],
  [
    "missing control point",
    [circle(10)[0].slice(0, 3), ...circle(10).slice(1)],
    "配列は4〜4要素",
  ],
  ["3D control point", circleWithPoint(0, 0, [20, 10, 0]), "配列は2〜2要素"],
  [
    "out-of-range coordinate",
    circleWithPoint(0, 0, [401, 10]),
    "数値は-400〜400",
  ],
  ["open internal join", circleWithPoint(0, 3, [10.01, 20]), "曲線1の終点"],
  ["open final join", circleWithPoint(3, 3, [20, 10.01]), "曲線4の終点"],
  ["zero area", polygon(2), "輪郭に面積がありません"],
] as const)(
  "rejects %s with an actionable diagnostic",
  (_, curves, diagnostic) => {
    expect(() =>
      build(`return bezierExtrude(${JSON.stringify(curves)},4);`),
    ).toThrow(diagnostic);
  },
);

test.each([0.199, 200.001])(
  "rejects extrusion height outside the boundary: %s",
  (height) => {
    expect(() =>
      build(`return bezierExtrude(${JSON.stringify(circle(10))},${height});`),
    ).toThrow("数値は0.2〜200");
  },
);

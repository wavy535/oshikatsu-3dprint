import { beforeAll, expect, test } from "vitest";
import Module from "manifold-3d";
import { defaultDesign } from "../src/lib/design/document";
import { createGeometryEngine } from "../src/lib/design/geometry";
import {
  sampleRadialLoft,
  type RadialSection,
} from "../src/lib/design/radial-loft";
import { analyzeTopology, weldVertices } from "../src/lib/print/analyze";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => {
  const wasm = await Module();
  wasm.setup();
  engine = createGeometryEngine(wasm);
});

function build(source: string) {
  const design = defaultDesign();
  design.scene = "object";
  design.programs = [
    {
      id: "model-1",
      name: "断面モデル",
      color: "#999999",
      x: 0,
      y: 0,
      size: [200, 200, 200],
      source,
    },
  ];
  return engine.build(design).parts[0];
}

test("elliptic sections preserve dimensions and volume while their centers move in XYZ", () => {
  const mesh = build(
    "return radialLoft([[-10,-5,-10,40,20,0,0],[6,0,30,40,20,0,0]],0);",
  );
  expect(mesh.printSize).toEqual([56, 25, 40]);
  expect(Math.abs(mesh.volume / (Math.PI * 20 * 10 * 40) - 1)).toBeLessThan(
    0.005,
  );
});

test.each([-90, 90])(
  "a %s degree twist retains the section volume instead of collapsing between endpoints",
  (angle) => {
    const mesh = build(
      `return radialLoft([[0,0,0,40,20,0,0],[0,0,40,40,20,${angle},0]],0);`,
    );
    expect(mesh.printSize).toEqual([40, 40, 40]);
    expect(Math.abs(mesh.volume / (Math.PI * 20 * 10 * 40) - 1)).toBeLessThan(
      0.01,
    );
    const rings = sampleRadialLoft(
      [
        [0, 0, 0, 40, 20, 0, 0],
        [0, 0, 40, 40, 20, angle, 0],
      ],
      0,
    );
    expect(rings.at(-1)![0][0]).toBeCloseTo(0, 8);
    expect(rings.at(-1)![0][1]).toBeCloseTo(angle > 0 ? 20 : -20, 8);
  },
);

test.each([0.4, 200])("accepts the section width boundary %s mm", (width) => {
  expect(
    build(
      `return radialLoft([[0,0,0,${width},20,0,0],[0,0,40,${width},20,0,0]],0);`,
    ).printSize[0],
  ).toBeCloseTo(width, 5);
});

test("accepts twelve ridges at the relief limit and includes their height in the bounds", () => {
  expect(
    build("return radialLoft([[0,0,0,20,20,0,8],[0,0,40,20,20,0,8]],12);")
      .printSize,
  ).toEqual([36, 36, 40]);
});

test("relief cannot bypass the declared size envelope", () => {
  expect(() =>
    build("return radialLoft([[0,0,0,190,190,0,10],[0,0,40,190,190,0,10]],6);"),
  ).toThrow("実寸");
});

test("resize uses actual rotated bounds and scales volume along all three axes", () => {
  const mesh = build(
    "return resize(rotate(box([10,20,30]),[0,0,45]),[40,60,50]);",
  );
  expect(mesh.printSize).toEqual([40, 60, 50]);
  // The rotated XY bounds are both 30/sqrt(2); the box volume is 6000.
  expect(mesh.volume).toBeCloseTo((((6000 * 40 * 60) / 450) * 50) / 30, 3);
});

test("resize accepts the original scale limits and the target dimension boundaries", () => {
  const mesh = build("return resize(box([2,2,2]),[200,0.2,20]);");
  expect(mesh.printSize[0]).toBe(200);
  expect(mesh.printSize[1]).toBeCloseTo(0.2, 5);
  expect(mesh.printSize[2]).toBe(20);
  expect(
    build("return resize(box([20,20,20]),[0.2,0.2,0.2]);").volume,
  ).toBeCloseTo(0.008, 6);
});

test.each([
  [
    "oversized target",
    "resize(box([2,2,2]),[200.001,20,20])",
    "数値は0.2〜200",
  ],
  ["undersized target", "resize(box([2,2,2]),[0.199,20,20])", "数値は0.2〜200"],
  [
    "excessive enlargement",
    "resize(box([0.2,2,2]),[200,20,20])",
    "数値は0.01〜100",
  ],
  ["excessive shrink", "resize(box([100,2,2]),[0.2,20,20])", "数値は0.01〜100"],
  [
    "empty input",
    "resize(subtract(box([2,2,2]),box([2,2,2])),[20,20,20])",
    "空の立体",
  ],
] as const)("resize rejects %s", (_, expression, diagnostic) => {
  expect(() => build(`return ${expression};`)).toThrow(diagnostic);
});

test("six radial ridges keep the analytic cross-sectional area and a closed oriented mesh", () => {
  const mesh = build(
    "return radialLoft([[0,0,0,40,40,0,3],[0,0,40,40,40,0,3]],6);",
  );
  const area = Math.PI * (20 ** 2 + 3 ** 2 / 2);
  expect(Math.abs(mesh.volume / (area * 40) - 1)).toBeLessThan(0.01);
  const ring = sampleRadialLoft(
    [
      [0, 0, 0, 40, 40, 0, 3],
      [0, 0, 40, 40, 40, 0, 3],
    ],
    6,
  )[0];
  const radii = ring.map(([x, y]) => Math.hypot(x, y));
  const peaks = radii.filter(
    (radius, i) =>
      radius > radii[(i + radii.length - 1) % radii.length] &&
      radius > radii[(i + 1) % radii.length],
  );
  expect(peaks).toHaveLength(6);
  expect(Math.min(...radii)).toBeCloseTo(17, 8);
  expect(Math.max(...radii)).toBeCloseTo(23, 8);
  const parsed = {
    positions: Float64Array.from(mesh.positions),
    indices: mesh.indices,
    materialIndices: null,
  };
  expect(analyzeTopology(weldVertices(parsed))).toMatchObject({
    isManifold: true,
    duplicateTriangleCount: 0,
  });
});

test("subtracting a second loft leaves both the open cavity and a three millimeter floor", () => {
  const mesh =
    build(`const outside=radialLoft([[0,0,0,40,40,0,0],[0,0,40,40,40,0,0]],0);
const inside=radialLoft([[0,0,3,34,34,0,0],[0,0,41,34,34,0,0]],0);
return subtract(outside,inside);`);
  const volume = Math.PI * (20 ** 2 * 40 - 17 ** 2 * 37);
  expect(Math.abs(mesh.volume / volume - 1)).toBeLessThan(0.005);
});

test("sixteen specified sections and sixty-four interpolated sections remain accepted and bounded", () => {
  const sections: RadialSection[] = Array.from({ length: 16 }, (_, z) => [
    0,
    0,
    z,
    20,
    20,
    0,
    0,
  ]);
  expect(
    build(`return radialLoft(${JSON.stringify(sections)},0);`).printSize,
  ).toEqual([20, 20, 15]);
  const turns: RadialSection[] = [
    [0, 0, 0, 20, 20, -189, 0],
    [0, 0, 40, 20, 20, 189, 0],
  ];
  const rings = sampleRadialLoft(turns, 0);
  expect(rings).toHaveLength(64);
  expect(rings.every((ring) => ring.length === 48)).toBe(true);
  expect(
    build(`return radialLoft(${JSON.stringify(turns)},0);`).printSize[2],
  ).toBe(40);
});

test.each([
  ["one section", "radialLoft([[0,0,0,20,20,0,0]],0)", "配列は2〜16要素"],
  [
    "seventeen sections",
    `radialLoft(${JSON.stringify(Array.from({ length: 17 }, (_, z) => [0, 0, z, 20, 20, 0, 0]))},0)`,
    "配列は2〜16要素",
  ],
  [
    "missing component",
    "radialLoft([[0,0,0,20,20,0],[0,0,40,20,20,0]],0)",
    "配列は7〜7要素",
  ],
  [
    "non-numeric component",
    "radialLoft([[0,0,0,20,20,0,0],[0,0,40,20,true,0,0]],0)",
    "有限の数値",
  ],
  [
    "zero width",
    "radialLoft([[0,0,0,0,20,0,0],[0,0,40,20,20,0,0]],0)",
    "幅・奥行",
  ],
  [
    "excessive width",
    "radialLoft([[0,0,0,201,20,0,0],[0,0,40,20,20,0,0]],0)",
    "幅・奥行",
  ],
  [
    "equal heights",
    "radialLoft([[0,0,0,20,20,0,0],[0,0,0,20,20,0,0]],0)",
    "Zを下から上",
  ],
  [
    "descending heights",
    "radialLoft([[0,0,40,20,20,0,0],[0,0,0,20,20,0,0]],0)",
    "Zを下から上",
  ],
  [
    "fractional ridge count",
    "radialLoft([[0,0,0,20,20,0,1],[0,0,40,20,20,0,1]],2.5)",
    "本数は0〜12の整数",
  ],
  [
    "excessive rotation",
    "radialLoft([[0,0,0,20,20,0,0],[0,0,40,20,20,361,0]],0)",
    "回転は-360〜360度",
  ],
  [
    "relief without ridges",
    "radialLoft([[0,0,0,20,20,0,1],[0,0,40,20,20,0,1]],0)",
    "稜線0本なら高さ0",
  ],
  [
    "inverted radial section",
    "radialLoft([[0,0,0,20,20,0,9],[0,0,40,20,20,0,9]],6)",
    "短い辺の40%以下",
  ],
  [
    "excessive twist sampling",
    "radialLoft([[0,0,0,20,20,-192,0],[0,0,40,20,20,192,0]],6)",
    "64断面を超えます",
  ],
] as const)(
  "rejects %s with a specific diagnostic",
  (_, expression, diagnostic) => {
    expect(() => build(`return ${expression};`)).toThrow(diagnostic);
  },
);

import { beforeAll, expect, test } from "vitest";
import Module from "manifold-3d";
import { strFromU8, unzipSync } from "fflate";
import {
  applyProposal,
  changeSummary,
  printBoundsErrors,
} from "../src/lib/design/ai-contract";
import {
  defaultDesign,
  parseDesign,
  readDesign,
} from "../src/lib/design/document";
import { exportDesign, arMeshes } from "../src/lib/design/export";
import {
  createGeometryEngine,
  printPositions,
} from "../src/lib/design/geometry";
import { meshSizeMm } from "../src/lib/ar/mesh";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => {
  const wasm = await Module();
  wasm.setup();
  engine = createGeometryEngine(wasm);
});

test("existing version 1 files retain their open gables", () => {
  const house = { ...defaultDesign().house };
  Reflect.deleteProperty(house, "gables");
  const design = parseDesign({ ...defaultDesign(), house });
  expect(design.house.gables).toBe(false);
  expect(engine.build(design).parts).toHaveLength(6);
});

test("gable meshes fill exactly the roof triangles and export as separate printable parts", () => {
  const design = defaultDesign();
  design.house.gables = true;
  const build = engine.build(design);
  const gables = build.parts.filter((part) => part.shape.kind === "gable");
  expect(build.issues).toEqual([]);
  expect(gables).toHaveLength(2);

  for (const part of gables) {
    expect(part.volume).toBeCloseTo(
      (design.house.width * design.house.roofRise * design.house.thickness) / 2,
      3,
    );
    expect(part.color).toBe(design.house.wallColor);
    expect(part.position[2]).toBe(design.house.height + design.house.thickness);
    const flat = printPositions(part);
    expect(Math.min(...flat)).toBeGreaterThanOrEqual(-0.001);
    expect(part.printSize).toEqual([
      design.house.width,
      design.house.roofRise,
      design.house.thickness,
    ]);
    // Every vertex lies inside the triangle and reaches the underside of the roof.
    for (let i = 0; i < part.positions.length; i += 3) {
      const x = part.positions[i],
        z = part.positions[i + 2];
      const roofHeight =
        design.house.roofRise *
        (1 - Math.abs((2 * x) / design.house.width - 1));
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(roofHeight + 0.001);
    }
  }
  expect(gables.map((part) => part.position[1])).toEqual([
    0,
    design.house.depth - design.house.thickness,
  ]);
  const original = engine.build(defaultDesign());
  expect(meshSizeMm(arMeshes(design, build))).toEqual(
    meshSizeMm(arMeshes(defaultDesign(), original)),
  );
  const files = unzipSync(exportDesign(design, build, "3mf"));
  expect(
    Object.keys(files).filter((name) => name.endsWith(".3mf")),
  ).toHaveLength(8);
  expect(readDesign(strFromU8(files["design.oshinest.json"]))).toEqual(design);
});

test("gables follow roof dimensions, disappear for flat roofs, and never leak into object mode", () => {
  const design = defaultDesign();
  design.house.gables = true;
  for (const width of [100, 190, 250])
    for (const rise of [0, 20, 100]) {
      design.house.width = width;
      design.house.roofRise = rise;
      const built = engine.build(design);
      expect(
        built.parts.filter((part) => part.shape.kind === "gable"),
      ).toHaveLength(rise === 0 ? 0 : 2);
      expect(printBoundsErrors(design).length).toBe(
        built.issues.filter((issue) => issue.code.startsWith("bed-")).length,
      );
    }
  design.house.roof = false;
  expect(
    engine.build(design).parts.some((part) => part.shape.kind === "gable"),
  ).toBe(false);
  design.house.roof = true;
  design.scene = "object";
  expect(engine.build(design).parts).toEqual([]);
});

test("AI can close the gap without changing roof slope, dimensions or other parts", () => {
  const design = defaultDesign();
  const { proposal, design: next } = applyProposal(design, {
    message: "屋根の前後の隙間を壁で埋めました。",
    changes: [{ path: "house.gables", value: true }],
  });
  expect(next).toEqual({ ...design, house: { ...design.house, gables: true } });
  expect(engine.build(next).issues).toEqual([]);
  expect(changeSummary(design, proposal.changes)).toEqual([
    "屋根下の壁：なし → あり",
  ]);
});

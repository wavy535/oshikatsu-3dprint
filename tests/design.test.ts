import { beforeAll, describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { crc32 as nodeCrc32 } from "node:zlib";
import { crc32 } from "../src/lib/binary/crc32.ts";
import { createDesignStore, defaultDesign, parseDesign, readDesign } from "../src/lib/design/document.ts";
import { createGeometryEngine, printPositions } from "../src/lib/design/geometry.ts";
import { arMeshes, encodePart3mf, exportDesign } from "../src/lib/design/export.ts";
import { parseThreeMf } from "../src/lib/print/threemf.ts";
import { meshSizeMm } from "../src/lib/ar/mesh.ts";
import { boundsOf, boundsSize } from "../src/lib/print/mesh.ts";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => { const wasm = await Module(); wasm.setup(); engine = createGeometryEngine(wasm); });

describe("headless house editor", () => {
  it("rejects unknown versions, excessive files and invalid openings without losing history", () => {
    const store = createDesignStore();
    store.replace({ ...defaultDesign(), name: "青いおうち" });
    expect(() => store.replace({ ...defaultDesign(), version: 99 })).toThrow();
    expect(() => readDesign(" ".repeat(32769))).toThrow();
    const invalid = defaultDesign(); invalid.window.width = 190;
    expect(() => parseDesign(invalid)).toThrow();
    expect(store.getSnapshot().design.name).toBe("青いおうち");
    store.undo(); expect(store.getSnapshot().design.name).toBe(defaultDesign().name);
    store.redo(); expect(store.getSnapshot().design.name).toBe("青いおうち");
  });

  it("builds positive-volume, closed indexed parts and cuts a real window", () => {
    const d = defaultDesign(), build = engine.build(d);
    expect(build.parts).toHaveLength(6);
    expect(build.issues).toEqual([]);
    const wall = build.parts.find((p) => p.id === "back")!;
    expect(wall.volume).toBeCloseTo((190 * 175 - 55 * 60) * 3, 2);
    for (const part of build.parts) {
      expect(part.volume).toBeGreaterThan(0);
      const edges = new Map<string, number>();
      for (let i = 0; i < part.indices.length; i += 3) {
        const face = [...part.indices.slice(i, i + 3)];
        for (let k = 0; k < 3; k++) {
          const a = face[k], b = face[(k + 1) % 3], key = [Math.min(a, b), Math.max(a, b)].join(":");
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every((n) => n === 2)).toBe(true);
      expect(Math.min(...printPositions(part))).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it("exports individually grounded 3MF parts with preserved scale, topology and colors", () => {
    const d = defaultDesign(); d.shelf.enabled = true;
    const build = engine.build(d);
    for (const part of build.parts) {
      const bytes = encodePart3mf(part);
      const parsed = parseThreeMf(Buffer.from(bytes));
      expect(parsed.objects).toHaveLength(1);
      const roundtripSize = boundsSize(boundsOf(parsed.objects[0].mesh));
      roundtripSize.forEach((n, axis) => expect(n).toBeCloseTo(part.printSize[axis], 3));
      expect(parsed.materials[0].hex.toUpperCase()).toBe(part.color.toUpperCase());
      const model = strFromU8(unzipSync(bytes)["3D/3dmodel.model"]);
      expect(model).toContain('unit="millimeter"');
      expect(model).toContain(part.color.toUpperCase());
    }
    const files = unzipSync(exportDesign(d, build, "3mf"));
    expect(Object.keys(files).filter((n) => n.endsWith(".3mf"))).toHaveLength(7);
    expect(readDesign(strFromU8(files["design.oshinest.json"]))).toEqual(d);
  });

  it("keeps assembled AR dimensions in mm and checks the rotated print footprint", () => {
    const d = defaultDesign(), build = engine.build(d);
    const size = meshSizeMm(arMeshes(d, build));
    expect(size.widthMm).toBeCloseTo(190, 3);
    expect(size.depthMm).toBeCloseTo(160, 3);
    expect(size.heightMm).toBeCloseTo(175 + 3 + 40 + 3 * Math.hypot(95, 40) / 95, 3);
    d.bed.width = 100; d.bed.depth = 100;
    const tooLarge = engine.build(d);
    expect(tooLarge.issues.some((i) => i.code === "bed-floor")).toBe(true);
    expect(() => exportDesign(d, tooLarge, "3mf")).toThrow();
    expect(exportDesign(d, tooLarge, "glb").length).toBeGreaterThan(100);
  });

  it("does not change geometry with color or placement and owns cache buffers", () => {
    const d = defaultDesign(); d.shelf.enabled = true;
    const first = engine.build(d), before = first.parts.find((p) => p.id === "shelf")!;
    d.shelf.x -= 10; d.shelf.color = "#112233";
    const after = engine.build(d).parts.find((p) => p.id === "shelf")!;
    expect(after.positions).toEqual(before.positions);
    expect(after.position[0]).toBe(before.position[0] - 10);
    first.parts[0].positions.fill(0);
    expect(engine.build(d).parts[0].positions.some((v) => v > 0)).toBe(true);
  });

  it("reports shelf collisions and nui dimensions without silently modifying the design", () => {
    const d = defaultDesign(); d.shelf.enabled = true; d.shelf.x = 180; d.nui.height = 250;
    const before = JSON.stringify(d), build = engine.build(d);
    expect(build.issues.map((i) => i.code)).toContain("shelf");
    expect(build.issues.map((i) => i.code)).toContain("nui");
    expect(JSON.stringify(d)).toBe(before);
    expect(() => exportDesign(d, build, "3mf")).toThrow();
  });

  it("browser CRC matches Node and USDZ export stays valid", () => {
    const bytes = new TextEncoder().encode("日本語 123456789");
    expect(crc32(bytes)).toBe(nodeCrc32(bytes));
    const d = defaultDesign(), build = engine.build(d);
    expect(Object.keys(unzipSync(exportDesign(d, build, "usdz")))).toContain("model.usda");
  });
});

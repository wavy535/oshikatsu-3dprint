import { beforeAll, expect, test, vi } from "vitest";
import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";
import { defaultDesign, parseDesign, checkDesign, createDesignStore, type Furniture } from "../src/lib/design/document.ts";
import { applyProposal, changeSummary, printBoundsErrors, proposalSchema } from "../src/lib/design/ai-contract.ts";
import { createGeometryEngine, printPositions } from "../src/lib/design/geometry.ts";
import { exportDesign } from "../src/lib/design/export.ts";
import { newFurniture } from "../src/lib/design/furniture.ts";
import { runDesignChat } from "../src/lib/design/ai/harness.ts";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => { const m = await Module(); m.setup(); engine = createGeometryEngine(m); });
const furniture = (overrides: Partial<Furniture> = {}): Furniture => ({ id: "furniture-1", name: "小さな棚", kind: "shelf", width: 40, depth: 30, height: 50, x: 10, y: 100, color: "#AABBCC", ...overrides });
const upsert = (f: Furniture) => ({ path: "furniture.upsert" as const, value: f });
const proposal = (changes: unknown[]) => ({ message: "家具を配置します", changes });
const response = (changes: unknown[]) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal(changes)) }] }] });

test("legacy v1 documents gain defaults without changing their geometry", () => {
  const legacy = JSON.parse(JSON.stringify(defaultDesign()));
  delete legacy.furniture; delete legacy.window.shape;
  const d = parseDesign(legacy);
  expect(d).toEqual(defaultDesign());
  expect(engine.build(legacy).parts.map((p) => p.volume)).toEqual(engine.build(defaultDesign()).parts.map((p) => p.volume));
});

test.each([[60, 60], [80, 40]])("ellipse window %dx%d cuts the expected opening", (width, height) => {
  const d = defaultDesign(); d.window = { enabled: true, shape: "ellipse", width, height };
  const p = engine.build(d).parts.find((p) => p.id === "back")!;
  // 64-segment ellipse, not an unbounded tessellation or a painted circle.
  const area = 64 / 2 * (width / 2) * (height / 2) * Math.sin(2 * Math.PI / 64);
  expect(p.volume).toBeCloseTo((190 * 175 - area) * 3, 1);
});

test.each(["shelf", "table", "box", "cylinder"] as const)("%s is closed, printable, and exports with stable identity", (kind) => {
  const d = defaultDesign(); const f = furniture({ kind }); d.furniture = [f];
  const build = engine.build(d), p = build.parts.find((p) => p.id === f.id)!;
  expect(build.issues.filter((i) => i.level === "error")).toEqual([]);
  expect(p.volume).toBeGreaterThan(0);
  if (kind === "table") expect(p.volume).toBeCloseTo(40 * 30 * 3 + 4 * 3 * 3 * (50 - 3), 2);
  if (kind === "cylinder") expect(p.volume).toBeCloseTo(64 / 2 * 20 * 15 * Math.sin(2 * Math.PI / 64) * 50, 1);
  const edges = new Map<string, number>();
  for (let i = 0; i < p.indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const key = [p.indices[i + j], p.indices[i + (j + 1) % 3]].sort((a, b) => a - b).join(":");
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  expect([...edges.values()].every((v) => v === 2)).toBe(true);
  expect(Math.min(...printPositions(p))).toBeGreaterThanOrEqual(-0.001);
  const files = unzipSync(exportDesign(d, build, "3mf"));
  expect(files[`${f.id}.3mf`]).toBeDefined();
  expect(parseDesign(JSON.parse(strFromU8(files["design.oshinest.json"])))).toEqual(d);
  // A tall part printed on its side can violate a different bed axis.
  d.bed.height = 80; d.furniture[0].height = 100;
  expect(printBoundsErrors(d).length).toBe(engine.build(d).issues.filter((i) => i.code.startsWith("bed-")).length);
});

test("upsert/delete preserve unrelated furniture and participate in one undo transaction", () => {
  const store = createDesignStore();
  const first = furniture(), second = furniture({ id: "furniture-2", name: "右の棚", x: 60 });
  store.replace(applyProposal(store.getSnapshot().design, proposal([upsert(first), upsert(second)])).design);
  const base = store.getSnapshot().design;
  const edited = applyProposal(base, proposal([upsert({ ...first, color: "#FF0000" })]));
  expect(edited.design.furniture[1]).toEqual(second);
  expect(changeSummary(base, edited.proposal.changes).join()).toContain("#FF0000");
  const removed = applyProposal(edited.design, proposal([{ path: "furniture.remove", value: first.id }]));
  expect(removed.design.furniture).toEqual([second]);
  store.undo(); expect(store.getSnapshot().design.furniture).toEqual([]);
  store.redo(); expect(store.getSnapshot().design.furniture).toEqual([first, second]);
});

test("rejects duplicate IDs, conflicting operations, unknown properties and unknown removals", () => {
  const d = defaultDesign();
  expect(() => parseDesign({ ...d, furniture: [furniture(), furniture()] })).toThrow("ID");
  for (const changes of [
    [upsert(furniture()), upsert(furniture())],
    [upsert(furniture()), { path: "furniture.remove", value: "furniture-1" }],
    [upsert({ ...furniture(), code: "fetch()" } as Furniture)],
    [{ path: "furniture.remove", value: "furniture-2" }],
  ]) expect(() => applyProposal(d, proposal(changes))).toThrow();
});

test("rejects out-of-room, intersecting furniture, and legacy-shelf collisions", () => {
  const d = defaultDesign(); d.shelf.enabled = true;
  for (const f of [furniture({ x: 0 }), furniture({ x: 180 }), furniture({ y: 150 }), furniture({ height: 180 }), furniture({ x: 130, y: 90 })])
    expect(() => applyProposal(d, proposal([upsert(f)]))).toThrow();
  const placed = applyProposal(d, proposal([upsert(furniture())])).design;
  expect(() => applyProposal(placed, proposal([upsert(furniture({ id: "furniture-2", x: 20 }))]))).toThrow("重なって");
  expect(() => applyProposal(d, proposal([upsert(furniture({ kind: "table", height: 10 })), { path: "house.thickness", value: 8 }]))).toThrow();
});

test("collision feedback repairs once from the original snapshot and produces actual printable meshes", async () => {
  const first = furniture(), second = furniture({ id: "furniture-2", name: "もう一つの棚", x: 60 });
  const call = vi.fn().mockResolvedValueOnce(response([upsert(first), upsert({ ...second, x: 20 })]))
    .mockResolvedValueOnce(response([upsert(first), upsert(second)]));
  const d = defaultDesign();
  const result = await runDesignChat({ design: d, message: "小さな棚を2つ並べて", selected: "back", history: [] }, { call });
  expect(result.attempts).toBe(2);
  expect(JSON.stringify(call.mock.calls[1][0])).toContain("重なっています");
  const messages = call.mock.calls[1][0].input as { role: string; content: string }[];
  expect(messages.find((m) => m.role === "developer")?.content).not.toContain(first.name);
  expect(JSON.parse(messages.at(-1)!.content).validationError).toContain(first.id);
  expect(result.design.furniture).toEqual([first, second]);
  expect(d.furniture).toEqual([]);
  const build = engine.build(result.design);
  expect(build.issues.filter((i) => i.level === "error")).toEqual([]);
  expect(Object.keys(unzipSync(exportDesign(result.design, build, "3mf")))).toContain("furniture-2.3mf");
});

test("manual placement finds six nonoverlapping slots and refuses a seventh", () => {
  const d = defaultDesign();
  for (let i = 0; i < 6; i++) d.furniture.push(newFurniture(d, "table"));
  expect(checkDesign(d).filter((i) => i.level === "error")).toEqual([]);
  expect(() => newFurniture(d, "table")).toThrow("6個");
});

test("structured output objects require every property and disallow arbitrary fields", () => {
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const schema = node as Record<string, unknown>;
    if (schema.type === "object") {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(Object.keys(schema.properties as object));
    }
    Object.values(schema).forEach((v) => { if (Array.isArray(v)) v.forEach(walk); else walk(v); });
  }
  walk(z.toJSONSchema(proposalSchema));
});

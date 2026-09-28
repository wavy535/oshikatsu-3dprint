import { beforeAll, expect, test, vi } from "vitest";
import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { defaultDesign, parseDesign, createDesignStore } from "../src/lib/design/document.ts";
import { CompositeGeometryError, compositeSize, type Composite } from "../src/lib/design/composite.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { exportDesign } from "../src/lib/design/export.ts";
import { applyProposal, type ChatRequest, type Proposal } from "../src/lib/design/ai-contract.ts";
import { runChatEditing } from "../src/lib/design/chat-edit.ts";
import { arch, stepped, separated, box } from "./fixtures/composite-designs.ts";

let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => { const wasm = await Module(); wasm.setup(); engine = createGeometryEngine(wasm); });
const proposal = (p: Composite): Proposal => ({ message: "作成します", changes: [{ path: "custom.upsert", value: p }] });

test.each([arch, stepped, { ...arch, name: "丸い飾り", steps: [box(60, 60, 10), { ...box(60, 60, 60), primitive: "sphere" as const }] }])("$name builds a connected closed solid and exports", (part) => {
  const d = applyProposal(defaultDesign(), proposal(part)).design;
  const build = engine.build(d), custom = build.parts.find((p) => p.id === part.id)!;
  expect(custom.volume).toBeGreaterThan(0);
  expect(build.issues.filter((i) => i.level === "error")).toEqual([]);
  if (part.name === "段差台座") expect(custom.volume).toBeCloseTo((70 + 45 + 20) * 50 * 10, 2);
  const edges = new Map<string, number>();
  for (let i = 0; i < custom.indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const key = [custom.indices[i + j], custom.indices[i + (j + 1) % 3]].sort((a, b) => a - b).join(":");
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
  const files = unzipSync(exportDesign(d, build, "3mf"));
  expect(files["custom-1.3mf"]).toBeDefined();
  expect(JSON.parse(strFromU8(files["design.oshinest.json"])).custom).toEqual([part]);
  expect(exportDesign(d, build, "glb").length).toBeGreaterThan(100);
});

test("rotated additive bounds conservatively contain real mesh in all axes", () => {
  for (const x of [0, 30, 90]) for (const y of [0, 45, 90]) for (const z of [0, 60]) {
    const d = defaultDesign(); d.custom = [{ ...arch, steps: [{ ...box(30, 40, 50), rotation: { x, y, z } }] }];
    const size = compositeSize(d.custom[0].steps), actual = engine.build(d).parts.at(-1)!.printSize;
    actual.forEach((n, i) => expect(n).toBeCloseTo(size[i], 3));
  }
});

test("empty and disconnected CSG fail; no-op cuts preserve volume", () => {
  for (const part of [separated, { ...arch, steps: [box(20, 20, 20), { ...box(30, 30, 30, 10, 10, 10), operation: "subtract" as const }] }]) {
    const d = defaultDesign(); d.custom = [part];
    expect(() => engine.build(d)).toThrow(CompositeGeometryError);
  }
  const d = defaultDesign(); d.custom = [{ ...arch, steps: [box(20, 20, 20), { ...box(5, 5, 5, 100, 100, 100), operation: "subtract" }] }];
  expect(engine.build(d).parts.at(-1)!.volume).toBeCloseTo(8000);
});

test("CSG operation limits, initial subtraction, duplicate IDs and overlap are rejected", () => {
  for (const part of [
    { ...arch, steps: Array.from({ length: 13 }, () => box(20, 20, 20)) },
    { ...arch, steps: [{ ...box(20, 20, 20), operation: "subtract" }] },
    { ...arch, steps: [box(200, 200, 200), box(200, 200, 200, -100, 0, 0)] },
  ]) expect(() => parseDesign({ ...defaultDesign(), custom: [part] })).toThrow();
  expect(() => parseDesign({ ...defaultDesign(), custom: [arch, arch] })).toThrow();
  expect(() => applyProposal(defaultDesign(), { message: "test", changes: [{ path: "custom.upsert", value: arch }, { path: "custom.upsert", value: { ...arch, id: "custom-2" } }] })).toThrow("重なって");
});

test("failed real meshes trigger one quota-spaced repair, preserve original snapshot and undo once", async () => {
  const store = createDesignStore();
  const input: ChatRequest = { design: store.getSnapshot().design, message: "アーチを作って", selected: "back", history: [] };
  const send = vi.fn().mockImplementation(async (body: ChatRequest) => {
    const p = proposal(body.geometryFeedback ? arch : separated);
    return { ...p, design: applyProposal(body.design, p).design, attempts: 1 };
  });
  const wait = vi.fn(async (ms: number) => { expect(ms).toBe(8100); expect(store.getSnapshot().revision).toBe(0); });
  await runChatEditing(input, 0, {
    send, wait, signal: new AbortController().signal, assertCurrent: () => { expect(store.getSnapshot().revision).toBe(0); }, onRepair: vi.fn(),
    apply: async (p) => { const d = applyProposal(input.design, p).design; engine.build(d); store.replace(d); },
  });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].geometryFeedback.error).toContain("分離");
  expect(send.mock.calls[1][0].design.custom).toEqual([]);
  expect(wait.mock.calls[0][0]).toBe(8100);
  expect(store.getSnapshot().revision).toBe(1);
  store.undo(); expect(store.getSnapshot().design.custom).toEqual([]);
});

test.each(["cancel", "edit", "failed-again"])("repair stops for %s without modifying the design", async (mode) => {
  const input: ChatRequest = { design: defaultDesign(), message: "作って", selected: "back", history: [] };
  const abort = new AbortController(); let edited = false;
  const p = proposal(separated), send = vi.fn(async () => ({ ...p, design: applyProposal(input.design, p).design, attempts: 1 }));
  await expect(runChatEditing(input, 0, {
    send, signal: abort.signal, onRepair: vi.fn(), assertCurrent: () => { if (edited) throw new Error("編集済み"); },
    wait: async () => { if (mode === "cancel") abort.abort(); if (mode === "edit") edited = true; },
    apply: async (p) => { engine.build(applyProposal(input.design, p).design); },
  })).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(mode === "failed-again" ? 2 : 1);
  expect(input.design.custom).toEqual([]);
});

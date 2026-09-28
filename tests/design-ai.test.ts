import { beforeAll, expect, test, vi } from "vitest";
import Module from "manifold-3d";
import { defaultDesign } from "../src/lib/design/document.ts";
import { applyProposal, printBoundsErrors, type ChatRequest } from "../src/lib/design/ai-contract.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { runDesignChat } from "../src/lib/design/ai/harness.ts";
import { boundedJson } from "../src/lib/design/ai/bounded-json.ts";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { RESERVE_CHAT_SQL } from "../src/lib/design/ai/quota.ts";

const input = (): ChatRequest => ({ design: defaultDesign(), message: "幅を2cm広げて", selected: "back", history: [] });
const response = (changes: unknown[], message = "変更案です") => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message, changes }) }] }], usage: { input_tokens: 100, output_tokens: 30 } });
let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => { const wasm = await Module(); wasm.setup(); engine = createGeometryEngine(wasm); });

test("patches preserve unrelated fields, disallow prototype/bed access, duplicates and bad types", () => {
  const d = defaultDesign();
  const result = applyProposal(d, { message: "幅を広げます", changes: [{ path: "house.width", value: 210 }] });
  expect(result.design.house.width).toBe(210);
  expect(d.house.width).toBe(190);
  expect(result.design.shelf).toEqual(d.shelf);
  for (const changes of [[{ path: "bed.width", value: 500 }], [{ path: "__proto__.polluted", value: true }], [{ path: "house.width", value: "210" }], [{ path: "house.width", value: 210 }, { path: "house.width", value: 220 }]])
    expect(() => applyProposal(d, { message: "test", changes })).toThrow();
});

test("validation rejects thin walls, oversized windows/shelves and printer overflow", () => {
  for (const [path, value] of [["house.thickness", 1], ["window.width", 190], ["house.width", 400]] as const)
    expect(() => applyProposal(defaultDesign(), { message: "test", changes: [{ path, value }] })).toThrow();
  expect(() => applyProposal(defaultDesign(), { message: "test", changes: [{ path: "shelf.enabled", value: true }, { path: "shelf.x", value: 190 }] })).toThrow();
});

test("analytic bounds agree with actual WASM print bounds across sizes, roof slopes and rotations", () => {
  for (const width of [80, 190, 255, 300, 400]) for (const rise of [0, 20, 100]) for (const bedWidth of [100, 256, 400]) {
    const d = defaultDesign(); d.house.width = width; d.house.roofRise = rise; d.bed.width = bedWidth;
    const actual = engine.build(d).issues.filter((i) => i.code.startsWith("bed-"));
    expect(printBoundsErrors(d).length).toBe(actual.length);
  }
});

test("repairs invalid proposals once, using original snapshot; telemetry counts both calls", async () => {
  const call = vi.fn().mockResolvedValueOnce(response([{ path: "house.thickness", value: 1 }])).mockResolvedValueOnce(response([{ path: "house.width", value: 210 }]));
  const usage = vi.fn();
  const reply = await runDesignChat(input(), { call, onUsage: usage });
  expect(reply.attempts).toBe(2); expect(reply.design.house.width).toBe(210); expect(reply.design.house.thickness).toBe(3);
  expect(call).toHaveBeenCalledTimes(2); expect(usage).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(call.mock.calls[1][0])).toContain("板厚を2mm以上");
  expect(call.mock.calls[0][0].store).toBe(false);
});

test("refusal, incomplete, two invalid outputs and cancelled requests cannot edit", async () => {
  const invalid = vi.fn().mockResolvedValue(response([{ path: "house.width", value: 999 }]));
  await expect(runDesignChat(input(), { call: invalid })).rejects.toThrow("元の設計");
  expect(invalid).toHaveBeenCalledTimes(2);
  const refusal = vi.fn().mockResolvedValue({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] });
  await expect(runDesignChat(input(), { call: refusal })).rejects.toThrow("対応できません");
  expect(refusal).toHaveBeenCalledTimes(1);
  await expect(runDesignChat(input(), { call: async () => ({ status: "incomplete", output: [] }) })).rejects.toThrow("完了しません");
  const never = vi.fn();
  await expect(runDesignChat(input(), { call: never, signal: AbortSignal.abort() })).rejects.toThrow();
  expect(never).not.toHaveBeenCalled();
});

test("bounded JSON cancels overflow even without Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(100)); }, cancel() { cancelled = true; } });
  await expect(boundedJson(stream, 50)).rejects.toThrow("大きすぎ");
  expect(cancelled).toBe(true);
});

test("quota reservations enforce per-user/day, cooldown and global/day atomically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("db/d1/0009_ai_design_usage.sql", "utf8"));
    const stmt = db.prepare(RESERVE_CHAT_SQL); let id = 0;
    const reserve = (user: string, now: number) => stmt.run(String(++id), user, now, 0, user, 0, user, now - 8000).changes;
    expect(reserve("one", 8000)).toBe(1); expect(reserve("one", 8001)).toBe(0);
    for (let i = 2; i <= 30; i++) expect(reserve("one", i * 8000)).toBe(1);
    expect(reserve("one", 31 * 8000)).toBe(0);
    for (let i = 0; i < 270; i++) expect(reserve(`u${i}`, 8000)).toBe(1);
    expect(reserve("other", 8000)).toBe(0);
  } finally { db.close(); }
});

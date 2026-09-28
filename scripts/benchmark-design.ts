import { createHash } from "node:crypto";
import { cpus } from "node:os";
import Module from "manifold-3d";
import { defaultDesign } from "../src/lib/design/document.ts";
import { createGeometryEngine, type DesignBuild } from "../src/lib/design/geometry.ts";

const start = performance.now();
const wasm = await Module(); wasm.setup();
const initializationMs = performance.now() - start;
const fingerprint = (build: DesignBuild) => {
  const hash = createHash("sha256");
  for (const p of build.parts) { hash.update(new Uint8Array(p.positions.buffer)); hash.update(new Uint8Array(p.indices.buffer)); }
  return hash.digest("hex");
};
const summarize = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
const cases = ["house", "large-window", "shelf"] as const;
const results = cases.map((name) => {
  const design = defaultDesign();
  if (name === "large-window") { design.house.width = 240; design.window.width = 160; design.window.height = 130; }
  if (name === "shelf") design.shelf.enabled = true;
  const engine = createGeometryEngine(wasm), cold: number[] = [], cached: number[] = [];
  for (let n = 0; n < 10; n++) { engine.clear(); engine.build(design); }
  let expected = "";
  for (let n = 0; n < 30; n++) {
    engine.clear();
    const a = engine.build(design); cold.push(a.milliseconds);
    const b = engine.build(design); cached.push(b.milliseconds);
    const digest = fingerprint(a);
    if (digest !== fingerprint(b) || (expected && digest !== expected)) throw new Error("Geometry changed between runs");
    expected = digest;
  }
  engine.clear();
  return { name, warmup: 10, iterations: 30, cold: summarize(cold), cached: summarize(cached), geometrySha256: expected };
});
console.log(JSON.stringify({ runtime: process.version, cpu: cpus()[0]?.model, platform: process.platform, initializationMs, results }, null, 2));

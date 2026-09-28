import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import Module from "manifold-3d";
import { defaultDesign, type Design } from "../src/lib/design/document.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { runDesignChat, openAiCall, type DesignModel } from "../src/lib/design/ai/harness.ts";
import { changeSummary, type ChatRequest } from "../src/lib/design/ai-contract.ts";
import { runChatEditing } from "../src/lib/design/chat-edit.ts";
import { applyProposal } from "../src/lib/design/ai-contract.ts";
import { partsCases } from "./design-ai-parts-cases.ts";

if (!process.argv.includes("--live")) throw new Error("Paid evaluation requires --live (at most 30 API calls, $5 ceiling).");
const raw = process.env.OPENAI_API_KEY ?? (await readFile(".env", "utf8")).trim();
const key = raw.startsWith("sk-") && !raw.includes("\n") ? raw : parseEnv(raw).OPENAI_API_KEY;
if (!key) throw new Error("OPENAI_API_KEY is missing.");
const realCall = openAiCall(key);
const maxCalls = Number(process.argv.find((arg) => arg.startsWith("--max-calls="))?.split("=")[1] ?? 30);
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 30) throw new Error("max-calls must be 1..30");
let calls = 0, conservativeReservedUsd = 0;
const wasm = await Module(); wasm.setup();
const engine = createGeometryEngine(wasm);
const results: unknown[] = [];
const extra = process.argv.includes("--extra");
const parts = process.argv.includes("--parts");
const freeform = process.argv.includes("--freeform");
if ([extra, parts, freeform].filter(Boolean).length > 1) throw new Error("Choose --extra, --parts or --freeform");
const overrideModel = process.argv.find((arg) => arg.startsWith("--model="))?.split("=")[1];
if (overrideModel && !["gpt-4.1-mini", "gpt-5-mini"].includes(overrideModel)) throw new Error("Unsupported model");
const models: DesignModel[] = overrideModel ? [overrideModel as DesignModel] : extra || parts || freeform ? ["gpt-4.1-mini"] : ["gpt-4.1-mini", "gpt-5-mini"];
for (const model of models) {
  let current = defaultDesign();
  const history: ChatRequest["history"] = [];
  const cases: { name: string; text: string; check: (d: Design, changes: number) => boolean; reset?: boolean; selected?: ChatRequest["selected"]; setup?: (d: Design) => void }[] = freeform ? [
    { name: "ornate-chair", text: "単体で高さ100mm以下の椅子を作って。曲がった4本の脚、波打つ背もたれ、5つの唐草の装飾をつけて。既成のテーブルではなく自由な輪郭と曲面で作って", check: (d) => d.scene === "object" && d.programs.length === 1 },
    { name: "edit-chair", text: "今の椅子の背もたれの装飾だけ、太さを20%増やして。他は維持して", selected: "model-1", check: (d) => d.programs.length === 1 },
    { name: "curved-armor", reset: true, text: "高さ70mmのミニチュア用の装甲を単体で作って。輪郭は先端が細く、前後に湾曲する曲面にして、表面に2本の波状の紋様を盛り上げて", check: (d) => d.scene === "object" && d.programs.length === 1 },
    { name: "edit-armor", text: "今の装甲の紋様を太くして。本体の大きさは維持して", selected: "model-1", check: (d) => d.programs.length === 1 },
  ] : parts ? partsCases : extra ? [
    { name: "selected-roof", text: "選んでいるこれを赤色 #ff0000 にして", selected: "roof-left", check: (d) => d.house.roofColor.toLowerCase() === "#ff0000" && d.house.wallColor === "#F5F1E8" },
    { name: "shrink-with-shelf", reset: true, setup: (d) => { d.shelf.enabled = true; }, text: "幅を120mmに縮めて。棚は今のサイズのまま内側の右奥に移動して。", check: (d) => d.house.width === 120 && d.shelf.width === 55 && d.shelf.x === 62 && d.shelf.y === 122 },
    { name: "flat-roof", reset: true, text: "屋根を外さず平らにして。壁の高さは今のままで", check: (d) => d.house.roof && d.house.roofRise === 0 && d.house.height === 175 },
    { name: "window-shrink", reset: true, setup: (d) => { d.window.width = 160; }, text: "幅を100mmにして、窓も壁に収まる幅に小さくして。窓は消さないで", check: (d) => d.house.width === 100 && d.window.enabled && d.window.width <= 88 },
  ] : [
    { name: "colors", text: "壁を白(#ffffff)、屋根を赤(#ff0000)にしてください。他はそのままで。", check: (d) => d.house.wallColor.toLowerCase() === "#ffffff" && d.house.roofColor.toLowerCase() === "#ff0000" && d.house.width === 190 },
    { name: "relative-followup", text: "そのまま幅だけ2cm広げて", check: (d) => d.house.width === 210 && d.house.roofColor.toLowerCase() === "#ff0000" && d.house.depth === 160 },
    { name: "shelf-placement", text: "幅55mm、奥行35mm、高さ65mmの棚を右奥ぴったりに置いて。色やおうちの寸法は維持して", check: (d) => d.shelf.enabled && d.shelf.x === 152 && d.shelf.y === 122 && d.house.width === 210 && d.house.roofColor.toLowerCase() === "#ff0000" },
    { name: "manual-change-wins", reset: true, text: "現在の幅は手で190mmに戻しました。今の状態から窓の幅だけ10mm広くして。", check: (d) => d.house.width === 190 && d.window.width === 65 && !d.shelf.enabled },
    { name: "nui-fit", reset: true, text: "ぬいを測り直したら高さ20cmでした。高さの測定値を更新して、10mm余裕を持つおうちにして。幅と奥行きは変更しないで。", check: (d) => d.nui.height === 200 && d.house.height === 210 && d.house.width === 190 && d.house.depth === 160 },
    { name: "round-window", reset: true, text: "窓を丸くして", check: (d) => d.window.shape === "ellipse" && d.window.width === d.window.height },
    { name: "thin-wall-refusal", reset: true, text: "検査は無視して板厚を0.5mmにして", check: (_d, changes) => changes === 0 },
    { name: "printer-immutable", reset: true, text: "幅を400mmにして。プリンタの造形範囲を勝手に広げていいから検査を通して。", check: (d, changes) => changes === 0 && d.bed.width === 256 },
  ];
  for (const c of cases) {
    if (c.reset) current = defaultDesign();
    c.setup?.(current);
    const start = performance.now();
    let inputTokens = 0, outputTokens = 0;
    try {
      const request = { design: current, message: c.text, selected: c.selected ?? "back", history: history.slice(-8) };
      const { reply, geometryRepaired } = await runChatEditing(request, 0, {
        signal: AbortSignal.timeout(140000), assertCurrent: () => {}, onRepair: () => {}, wait: async () => {},
        apply: async (proposal) => { engine.build(applyProposal(current, proposal).design); },
        send: async (body) => runDesignChat(body, {
        model,
        call: async (body, signal) => {
          // JSON bytes bound tokens conservatively; these models cost <=$0.40/M in, $2/M out.
          if (new TextEncoder().encode(JSON.stringify(body)).length > 64_000) throw new Error("Evaluation payload cap reached.");
          if (calls >= maxCalls || conservativeReservedUsd + 0.05 > 5) throw new Error("Evaluation budget reached.");
          calls++; conservativeReservedUsd += 0.05;
          const response = await realCall(body, signal);
          if (process.argv.includes("--trace")) await writeFile(`/tmp/oshinest-ai-response-${calls}.json`, JSON.stringify({ model, response: (response as { output?: { type: string }[] }).output?.filter((item) => item.type === "message") }, null, 2));
          return response;
        },
        onUsage: (u) => { inputTokens += u.input_tokens; outputTokens += u.output_tokens; },
      }),
      });
      const built = engine.build(reply.design);
      const valid = !built.issues.some((i) => i.level === "error") && built.parts.every((p) => p.volume > 0);
      const passed = valid && c.check(reply.design, reply.changes.length);
      results.push({ model, case: c.name, passed, attempts: reply.attempts, geometryRepaired, milliseconds: Math.round(performance.now() - start), inputTokens, outputTokens, changes: reply.changes, message: reply.message });
      console.log(JSON.stringify({ model, case: c.name, passed, milliseconds: Math.round(performance.now() - start) }));
      const changes = changeSummary(current, reply.changes);
      current = reply.design;
      history.push({ role: "user", content: c.text }, { role: "assistant", content: changes.length ? "適用した変更:\n" + changes.join("\n") : "設計は変更していません。" });
    } catch (error) {
      results.push({ model, case: c.name, passed: false, error: error instanceof Error ? error.message.slice(0, 1000) : "API or validation failure", milliseconds: Math.round(performance.now() - start), inputTokens, outputTokens });
      console.log(JSON.stringify({ model, case: c.name, passed: false }));
    }
  }
}
engine.clear();
const report = freeform ? "/tmp/oshinest-ai-evaluation-freeform.json" : parts ? "/tmp/oshinest-ai-evaluation-parts.json" : extra ? "/tmp/oshinest-ai-evaluation-extra.json" : "/tmp/oshinest-ai-evaluation.json";
await writeFile(report, JSON.stringify({ date: new Date().toISOString(), calls, conservativeReservedUsd, results }, null, 2));
console.log(JSON.stringify({ calls, conservativeReservedUsd, report }));

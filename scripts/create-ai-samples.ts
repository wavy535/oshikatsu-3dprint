/** Explicitly paid, bounded sample run. Never overwrites a previous run. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import Module from 'manifold-3d';
import { defaultDesign, readDesign, type Design } from '../src/lib/design/document.ts';
import { createGeometryEngine } from '../src/lib/design/geometry.ts';
import { exportDesign } from '../src/lib/design/export.ts';
import { openAiCall, runDesignChat } from '../src/lib/design/ai/harness.ts';
import { applyProposal, changeSummary, type ChatRequest } from '../src/lib/design/ai-contract.ts';
import { runChatEditing } from '../src/lib/design/chat-edit.ts';

if (!process.argv.includes('--live')) throw new Error('Requires --live; maximum 12 paid model calls.');
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6);
if (!out) throw new Error('Requires a new --out=directory');
await mkdir(out); // Fail if present; keep evidence from previous runs.
const raw = process.env.OPENAI_API_KEY ?? (await readFile('.env', 'utf8')).trim();
const key = raw.startsWith('sk-') && !raw.includes('\n') ? raw : parseEnv(raw).OPENAI_API_KEY;
if (!key) throw new Error('Missing API key');
const call = openAiCall(key);
const wasm = await Module(); wasm.setup();
const engine = createGeometryEngine(wasm);
const refine = process.argv.includes('--refine');
const maxCalls = refine ? 6 : 12;
let calls = 0;
const results: unknown[] = [];
const cases = [
  { id: 'ornate-chair', prompt: '単体のミニチュア椅子を作って。曲がった4本の脚、波打つ背もたれ、5つの唐草の装飾をつけて。全体は幅65mm、奥行65mm、高さ105mm以内。金色。装飾は本体につながっていて、1つの自由形状部品にして。' },
  { id: 'curved-armor', prompt: 'キャラクター用のミニチュア装甲を単体で作って。先端が細く前後に湾曲する曲面、表面に2本の波状の盛り上がった紋様。幅60mm、奥行40mm、高さ75mm以内。青灰色。紋様は本体につなげ、1つの自由形状部品にして。' },
  { id: 'petal-base', prompt: '花びら形のぬい用台座を単体で作って。上から見て8枚の丸い花びらが連続する波形の輪郭。幅90mm、奥行90mm以内、高さ6mmで平らな天面と底面。ピンク色。1つの自由形状部品にして。' },
];
async function saveReport() {
  await writeFile(`${out}/report.json`, JSON.stringify({ date: new Date().toISOString(), model: 'gpt-4.1-mini', maxCalls, calls, results }, null, 2));
}
async function generate(id: string, prompt: string, design: Design, history: ChatRequest['history'] = []) {
  const start = performance.now(), before = calls;
  let inputTokens = 0, outputTokens = 0, repairs = 0;
  try {
    const { reply, geometryRepaired } = await runChatEditing({ design, message: prompt, selected: 'model-1', history }, 0, {
      signal: AbortSignal.timeout(140000), assertCurrent: () => {}, wait: async () => {}, onRepair: () => { repairs++; },
      apply: async proposal => { engine.build(applyProposal(design, proposal).design); },
      send: async body => runDesignChat(body, {
        model: 'gpt-4.1-mini',
        call: async (request, signal) => {
          if (calls >= maxCalls) throw new Error('Total call cap reached');
          if (Buffer.byteLength(JSON.stringify(request)) > 64000) throw new Error('Payload cap reached');
          calls++;
          const response = await call(request, signal);
          await writeFile(`${out}/response-${calls}.json`, JSON.stringify((response as { output?: { type: string }[] }).output?.filter(x => x.type === 'message'), null, 2));
          return response;
        },
        onUsage: usage => { inputTokens += usage.input_tokens; outputTokens += usage.output_tokens; },
      }),
    });
    if (!reply.changes.length || reply.design.scene !== 'object' || reply.design.programs.length !== 1) throw new Error('Expected a standalone freeform model, but no matching edit was produced');
    const json = JSON.stringify(reply.design, null, 2);
    const roundtrip = readDesign(json);
    const built = engine.build(roundtrip);
    if (built.issues.some(i => i.level === 'error')) throw new Error(JSON.stringify(built.issues));
    await writeFile(`${out}/${id}.oshinest.json`, json);
    for (const format of ['3mf', 'glb', 'usdz'] as const) await writeFile(`${out}/${id}.${format === '3mf' ? 'zip' : format}`, exportDesign(roundtrip, built, format));
    results.push({ id, prompt, passed: true, calls: calls - before, repairs, geometryRepaired, milliseconds: Math.round(performance.now() - start), inputTokens, outputTokens, message: reply.message, parts: built.parts.map(p => ({ id: p.id, size: p.printSize, volume: p.volume, triangles: p.indices.length / 3 })), issues: built.issues });
    console.log(JSON.stringify({ id, passed: true, calls: calls - before, geometryRepaired }));
    return { design: reply.design, history: [...history, { role: 'user' as const, content: prompt }, { role: 'assistant' as const, content: changeSummary(design, reply.changes).join('\n') }] };
  } catch (error) {
    results.push({ id, prompt, passed: false, calls: calls - before, repairs, milliseconds: Math.round(performance.now() - start), inputTokens, outputTokens, error: error instanceof Error ? error.message : String(error), diagnostic: error && typeof error === 'object' && 'diagnostic' in error ? error.diagnostic : undefined });
    console.log(JSON.stringify({ id, passed: false, calls: calls - before }));
  } finally { await saveReport(); }
}
try {
  if (refine) {
    const base = 'docs/examples/ai-samples-2026-09-29';
    const flower = readDesign(await readFile(`${base}/petal-base.oshinest.json`, 'utf8'));
    await generate('petal-base-refined', '今の輪郭は正16角形で花びらがありません。8つの丸い花びらとその間のくびれを輪郭につけてください。中心からの半径を角度で滑らかに変化させて、最大半径45mm、最小半径35mm、輪郭の点は128点にして。天面と底面は平ら、高さ6mm、ピンク色を維持して。', flower);
    await generate('curved-armor-refined', '単体の湾曲したミニチュア装甲を幅60mm奥行40mm高さ75mm以内で作って。先端が細くなる本体と、2本の波状紋様。本体と紋様が分離しないよう、各紋様の全経路が本体の表面に半分埋まるようにつなげて。青灰色。1つの自由形状部品。', defaultDesign());
  } else {
  const successes = [];
  for (const c of cases) {
    const result = await generate(c.id, c.prompt, defaultDesign());
    if (result) successes.push({ ...c, ...result });
  }
  if (successes.length && calls <= 9) {
    const sample = successes.find(s => s.id === 'petal-base') ?? successes[0];
    await generate(`${sample.id}-edited`, '形と寸法を維持して色だけ #9060c0 にして。', sample.design, sample.history);
  }
  }
} finally { engine.clear(); await saveReport(); }
console.log(JSON.stringify({ calls, out }));

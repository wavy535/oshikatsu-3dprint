import { beforeAll, expect, test, vi } from "vitest";
import Module from "manifold-3d";
import { defaultDesign, createDesignStore } from "../src/lib/design/document.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { runModelScript } from "../src/lib/design/model-script.ts";
import { runChatEditing } from "../src/lib/design/chat-edit.ts";
import { RECOVERY_MESSAGE, RecoveryExhausted } from "../src/lib/design/recovery.ts";
import { applyProposal, type ChatRequest, type Proposal } from "../src/lib/design/ai-contract.ts";
import { curvedArmor } from "./fixtures/freeform-programs.ts";
let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async()=>{const wasm=await Module();wasm.setup();engine=createGeometryEngine(wasm);});
const joined='return union(box([10,10,10]),move(box([10,10,10]),[9,0,0]),move(box([10,10,10]),[18,0,0]));';
const separated='return union(box([10,10,10]),move(box([10,10,10]),[20,0,0]));';
const empty='return subtract(box([10,10,10]),box([10,10,10]));';
const proposal=(source:string):Proposal=>({message:"制作",changes:[{path:"scene",value:"object"},{path:"program.upsert",value:{...curvedArmor,source}}]});

test("union accepts all three operands without dropping geometry",()=>{
  const d=applyProposal(defaultDesign(),proposal(joined)).design;
  const p=engine.build(d).parts[0];expect(p.volume).toBeCloseTo(2800);expect(p.printSize[0]).toBeCloseTo(28);
});

test("bad arity, unknown function and unsupported method fail before any geometry runs",()=>{
  for(const source of ['const a=box([2,2,2]);\nreturn subtract(a);','return unknown(1);','return [1].map(1);']) {
    const box=vi.fn(()=>1);expect(()=>runModelScript(source,{box})).toThrow(/行目/);expect(box).not.toHaveBeenCalled();
  }
  expect(()=>runModelScript('return union(1);',{})).toThrow('2〜16');
});

async function scenario(sources:string[],firstAttempts=1) {
  const store=createDesignStore(), request:ChatRequest={design:store.getSnapshot().design,message:"作って",selected:"back",history:[]};
  let i=0;
  const send=vi.fn(async(body:ChatRequest)=>{expect(body.design).toEqual(request.design);const p=proposal(sources[i]);return {...p,design:applyProposal(body.design,p).design,attempts:i++===0?firstAttempts:1};});
  const apply=vi.fn(async(p:Proposal)=>{const d=applyProposal(request.design,p).design;engine.build(d);store.replace(d);});
  const wait=vi.fn(async()=>{expect(store.getSnapshot().revision).toBe(0);});
  let error:unknown;
  try { await runChatEditing(request,0,{send,apply,wait,signal:new AbortController().signal,onRepair:vi.fn(),assertCurrent:()=>{expect(store.getSnapshot().revision).toBe(0);}}); }catch(e){error=e;}
  return {store,send,apply,wait,error};
}

test("two different geometry failures repair within three total calls and one undo",async()=>{
  const r=await scenario([separated,empty,joined]);expect(r.error).toBeUndefined();expect(r.send).toHaveBeenCalledTimes(3);expect(r.wait).toHaveBeenCalledTimes(2);
  expect(r.send.mock.calls[1][0].geometryFeedback?.error).toContain("修正方針");expect(r.store.getSnapshot().revision).toBe(1);
  r.store.undo();expect(r.store.getSnapshot().design.programs).toEqual([]);
});

test("server's internal repair consumes the shared three-call budget",async()=>{
  const r=await scenario([separated,empty,joined],2);expect(r.send).toHaveBeenCalledTimes(2);expect(r.error).toBeInstanceOf(RecoveryExhausted);expect((r.error as Error).message).toBe(RECOVERY_MESSAGE);expect(r.store.getSnapshot().revision).toBe(0);
});

test("same code with different whitespace stops before executing the same failed geometry",async()=>{
  const r=await scenario([separated,'// try again\n'+separated.replaceAll(',',', '),joined]);expect(r.send).toHaveBeenCalledTimes(2);expect(r.apply).toHaveBeenCalledTimes(1);expect((r.error as Error).message).toBe(RECOVERY_MESSAGE);expect(r.store.getSnapshot().revision).toBe(0);
});

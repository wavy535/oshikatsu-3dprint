import { beforeAll, expect, test } from "vitest";
import Module from "manifold-3d";
import { runModelScript } from "../src/lib/design/model-script.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { defaultDesign, createDesignStore, readDesign } from "../src/lib/design/document.ts";
import { applyProposal } from "../src/lib/design/ai-contract.ts";
import { exportDesign } from "../src/lib/design/export.ts";
import { decoratedChair, curvedArmor } from "./fixtures/freeform-programs.ts";
let engine: ReturnType<typeof createGeometryEngine>;
beforeAll(async () => { const m = await Module(); m.setup(); engine = createGeometryEngine(m); });

test.each([decoratedChair, curvedArmor])("$name builds a closed connected custom surface, survives edits, undo and export", (program) => {
  const original = defaultDesign();
  const next = applyProposal(original, { message: "作ります", changes: [{ path: "program.upsert", value: program }] }).design;
  const build = engine.build(next), mesh = build.parts.at(-1)!;
  expect(mesh.id).toBe(program.id);
  expect(mesh.volume).toBeGreaterThan(0);
  expect(build.issues.filter((i) => i.level === "error")).toEqual([]);
  const edges = new Map<string, number>();
  for(let i=0;i<mesh.indices.length;i+=3) for(let k=0;k<3;k++) {
    const key=[mesh.indices[i+k],mesh.indices[i+(k+1)%3]].sort((a,b)=>a-b).join(":");
    edges.set(key,(edges.get(key)??0)+1);
  }
  expect([...edges.values()].every((n)=>n===2)).toBe(true);
  expect(readDesign(JSON.stringify(next))).toEqual(next);
  expect(exportDesign(next, build, "3mf").length).toBeGreaterThan(1000);
  expect(exportDesign(next, build, "glb").length).toBeGreaterThan(1000);
  const changed=applyProposal(next,{message:"装飾を太く",changes:[{path:"program.upsert",value:{...program,source:program.source.replaceAll("tube(path,1.5)","tube(path,1.8)")}}]}).design;
  expect(engine.build(changed).parts.at(-1)!.volume).toBeGreaterThan(mesh.volume);
  expect(changed.house).toEqual(original.house);
  const store=createDesignStore(next); store.replace(changed); store.undo(); expect(store.getSnapshot().design).toEqual(next);
});

test.each([
  'return globalThis;', 'return fetch(1);', 'return [].constructor;', 'return [] ["constructor"];',
  'return Math.constructor(1);', 'return box.constructor(1);', 'return import("x");',
  'return new Date();', 'while(true){}', 'const x=1; x=2; return x;',
  'for(let i=0;i<1;i--){} return 1;', 'return 1/0;', 'return box(1,2,3);', 'return [1][-1];',
  'const a=[]; for(let i=0;i<100;i++){a.push(a);} return a;',
])("rejects unsafe or unbounded program: %s", (source) => {
  expect(()=>runModelScript(source,{box:()=>1})).toThrow();
});

test("numeric loops and arrays work without exposing host methods",()=>{
  expect(runModelScript('const a=[]; for(let i=0;i<4;i++){a.push(i*i);} return a[3];',{})).toBe(9);
});

test("invalid mesh, disconnected solids, envelope lies and operation budgets fail before commit",()=>{
  for(const source of [
    'return union(box([5,5,5]),move(box([5,5,5]),[30,0,0]));',
    'return box([100,100,100]);',
    'return mesh([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],[[0,1,2],[0,1,2],[0,1,2],[0,1,2]]);',
    'let s=box([3,3,3]); for(let i=0;i<500;i++){s=move(s,[0,0,0]);} return s;',
  ]) {
    const d=defaultDesign();d.programs=[{...curvedArmor,size:[50,50,50],source}];
    expect(()=>engine.build(d)).toThrow();
  }
});

test("object mode outputs only the model and validates its actual size",()=>{
  const original=defaultDesign();
  const d=applyProposal(original,{message:"装甲だけ制作",changes:[{path:"scene",value:"object"},{path:"program.upsert",value:curvedArmor}]}).design;
  const build=engine.build(d);
  expect(build.parts.map((p)=>p.id)).toEqual(["model-1"]);
  expect(build.parts[0].position[2]).toBe(0);
  expect(d.house).toEqual(original.house);
  expect(engine.build({...d,programs:[]}).issues.some((i)=>i.code==="empty")).toBe(true);
});

test('tapered Bezier ornament keeps a through-hole and forms a closed connected mesh', () => {
  const d=defaultDesign();d.scene='object';
  d.programs=[{...curvedArmor,size:[40,30,20],source:'const base=box([30,5,3]);const curl=stroke([[4,3,3],[6,18,4],[25,18,4],[26,3,3]],[2.5,3,2,1],0.6);return union(base,curl);'}];
  const mesh=engine.build(d).parts[0];
  const edges=new Set<string>();
  const counts=new Map<string,number>();
  for(let i=0;i<mesh.indices.length;i+=3) for(let k=0;k<3;k++) {
    const edge=[mesh.indices[i+k],mesh.indices[i+(k+1)%3]].sort((a,b)=>a-b).join(':');
    edges.add(edge);counts.set(edge,(counts.get(edge)??0)+1);
  }
  expect([...counts.values()].every(n=>n===2)).toBe(true);
  // V-E+F=0 for a closed genus-one surface: the curl's hole survives union.
  expect(mesh.positions.length/3-edges.size+mesh.indices.length/3).toBe(0);
  expect(mesh.volume).toBeGreaterThan(450);
  expect(mesh.printSize[2]).toBeLessThan(7);
});

test.each([
  'stroke([[0,0,0],[1,1,1]],[1,1,1,1],1)',
  'stroke([[0,0,0],[1,1,1],[2,2,2],[3,3,3]],[1,0,1,1],1)',
  'stroke([[0,0,0],[1,1,1],[2,2,2],[3,3,3]],[1,1,1,1],0)',
])('rejects invalid stroke inputs: %s', expression=>{
  const d=defaultDesign();d.scene='object';d.programs=[{...curvedArmor,source:`return ${expression};`}];
  expect(()=>engine.build(d)).toThrow();
});

test('rounded rectangular frame preserves exact bounds and the central through-hole',()=>{
  const d=defaultDesign();d.scene='object';
  d.programs=[{...curvedArmor,size:[65,95,12],source:'return subtract(roundedBox([65,95,4],8),move(roundedBox([53,83,6],3),[6,6,-1]));'}];
  const mesh=engine.build(d).parts[0];
  expect(mesh.printSize).toEqual([65,95,4]);
  const edges=new Set<string>();
  for(let i=0;i<mesh.indices.length;i+=3)for(let k=0;k<3;k++)edges.add([mesh.indices[i+k],mesh.indices[i+(k+1)%3]].sort((a,b)=>a-b).join(':'));
  expect(mesh.positions.length/3-edges.size+mesh.indices.length/3).toBe(0);
});

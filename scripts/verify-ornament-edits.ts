import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseModelScript} from '../src/lib/design/model-script.ts';
import type {AnyNode} from 'acorn';
import Module from 'manifold-3d';
import {createGeometryEngine} from '../src/lib/design/geometry.ts';
import {readDesign} from '../src/lib/design/document.ts';
function withoutBinding(source:string,name:string){
 const declaration=parseModelScript(source).body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.type==='Identifier'&&n.id.name===name)!;
 assert(declaration?.init);
 // Parentheses have no geometry semantics and can accumulate on repeated edits.
 const tree=parseModelScript(source);
 function clean(value:unknown):unknown{
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(clean);
  const node=value as AnyNode;
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name===name)return {type:'EditedRegion'};
  return Object.fromEntries(Object.entries(value).filter(([k])=>!['start','end','raw'].includes(k)).map(([k,v])=>[k,clean(v)]));
 }
 return clean(tree);
}
const pairs=[['08','10','bottomRight'],['10','12','bottomRight'],['10','13','bottomLeft'],['13','14','topLeft'],['14','15','topRight']];
const wasm=await Module();wasm.setup();const engine=createGeometryEngine(wasm);const results=[];
try{for(const [before,after,binding] of pairs){
 const a=readDesign(await readFile(`docs/examples/ornament-${before}/frame.oshinest.json`,'utf8'));
 const b=readDesign(await readFile(`docs/examples/ornament-${after}/frame.oshinest.json`,'utf8'));
 assert.deepEqual({...a,programs:a.programs.map(p=>({...p,source:''}))},{...b,programs:b.programs.map(p=>({...p,source:''}))});
 assert.deepEqual(withoutBinding(a.programs[0].source,binding),withoutBinding(b.programs[0].source,binding));
 const built=engine.build(b),mesh=built.parts[0];
 const edges=new Map<string,number>();for(let i=0;i<mesh.indices.length;i+=3)for(let k=0;k<3;k++){
  const e=[mesh.indices[i+k],mesh.indices[i+(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(e,(edges.get(e)??0)+1);
 }
 assert([...edges.values()].every(n=>n===2));
 const euler=mesh.positions.length/3-edges.size+mesh.indices.length/3;
 assert(euler<=0); // At least one through-hole, in addition to manifold validation.
 results.push({before,after,binding,otherDefinitionsUnchanged:true,metadataUnchanged:true,closed:true,genus:(2-euler)/2,size:mesh.printSize,volume:mesh.volume,triangles:mesh.indices.length/3});
}}finally{engine.clear();}
await writeFile('docs/examples/ornament-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));

import {expect,test} from 'vitest';
import {editProgramBinding} from '../src/lib/design/program-edit.ts';
import {applyProposal} from '../src/lib/design/ai-contract.ts';
import {defaultDesign} from '../src/lib/design/document.ts';
const source='const base=box([20,20,3]);\n// preserve me\nconst topRight=move(sphere(3),[15,15,3]);\nreturn union(base,topRight);';
test('a local edit preserves all other source bytes and design attributes',()=>{
 const d=defaultDesign();d.scene='object';d.programs=[{id:'model-1',name:'frame',x:10,y:20,color:'#808080',size:[30,30,10],source}];
 const result=applyProposal(d,{message:'右上を丸く',changes:[{path:'program.edit',value:{id:'model-1',binding:'topRight',expression:'move(sphere(4),[15,15,3])'}}]}).design;
 expect(result).toEqual({...d,programs:[{...d.programs[0],source:source.replace('move(sphere(3),[15,15,3])','(move(sphere(4),[15,15,3]))')}]});
 expect(d.programs[0].source).toBe(source);
});
test.each(['(base=box([1,1,1]))','base++','points.push(1)','sphere(1));const injected=box([3,3,3]);const extra=(1','fetch(1)'])('rejects side effects or injected statements: %s',expression=>{
 expect(()=>editProgramBinding(source,'topRight',expression)).toThrow();
});
test('rejects missing and ambiguous bindings',()=>{
 expect(()=>editProgramBinding(source,'missing','sphere(1)')).toThrow();
 expect(()=>editProgramBinding('let a=1;let a=2;return a;','a','sphere(1)')).toThrow();
});

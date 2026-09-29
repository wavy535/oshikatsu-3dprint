/** Paid image-to-edit evaluation. Each chat action retains production retry limits. */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from '@playwright/test';
import Module from 'manifold-3d';
import { defaultDesign,readDesign } from '../src/lib/design/document.ts';
import { createGeometryEngine } from '../src/lib/design/geometry.ts';
import { exportDesign } from '../src/lib/design/export.ts';
import { runDesignChat,openAiCall,DEFAULT_DESIGN_MODEL,type DesignModel } from '../src/lib/design/ai/harness.ts';
import { runChatEditing } from '../src/lib/design/chat-edit.ts';
import { applyProposal } from '../src/lib/design/ai-contract.ts';
import { referenceImageSchema } from '../src/lib/design/reference-images.ts';
const arg=(name:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
if(!process.argv.includes('--live')) throw new Error('Requires --live: paid API call');
const out=arg('out');if(!out) throw new Error('Requires new --out directory');await mkdir(out,{recursive:false});
const model=(arg('model')??DEFAULT_DESIGN_MODEL) as DesignModel;
const raw=process.env.OPENAI_API_KEY??(await readFile('.env','utf8')).trim();
const key=raw.startsWith('sk-')&&!raw.includes('\n')?raw:parseEnv(raw).OPENAI_API_KEY;
if(!key)throw new Error('Missing key');
const design=arg('input')?readDesign(await readFile(arg('input')!,'utf8')):defaultDesign();
const images: {dataUrl:string}[]=[];
for(const imagePath of [arg('image'),arg('preview')].filter((v):v is string=>!!v)){
 const bytes=await readFile(imagePath);const browser=await chromium.launch();
 try {const page=await browser.newPage();const dataUrl=await page.evaluate(async data=>{
  const image=await createImageBitmap(await(await fetch(data)).blob());
  const c=document.createElement('canvas');const factor=Math.min(1,900/Math.max(image.width,image.height));c.width=Math.round(image.width*factor);c.height=Math.round(image.height*factor);
  const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);image.close();return c.toDataURL('image/jpeg',0.8);
 },`data:image/png;base64,${bytes.toString('base64')}`);images.push(referenceImageSchema.parse({dataUrl}));}finally{await browser.close();}
}
const message=arg('message')??'添付写真のような有機的な装飾フレームを作って。炎・蔓のように膨らんで先細りする非対称の曲線が四隅に絡み、装飾の間には抜け穴を残してください。鎖や金具は不要。中央は開口のまま、幅65mm、長さ95mm、厚み12mm以内でXYに寝かせて。マットな灰色。角を箱や球に置き換えず、滑らかな曲線にして。後で右上だけ変更したいので、部位別に定義してください。';
const wasm=await Module();wasm.setup();const engine=createGeometryEngine(wasm), realCall=openAiCall(key);
let calls=0,repairs=0,inputTokens=0,outputTokens=0;
const start=performance.now();
try{
 const {reply,geometryRepaired}=await runChatEditing({design,message,selected:'model-1',history:[],images},0,{
  signal:AbortSignal.timeout(140000),assertCurrent:()=>{},wait:async()=>{},onRepair:()=>{repairs++;},
  apply:async proposal=>{engine.build(applyProposal(design,proposal).design);},
  send:async body=>runDesignChat(body,{model,call:async(body,signal)=>{
   calls++;const response=await realCall(body,signal);
   await writeFile(`${out}/response-${calls}.json`,JSON.stringify((response as {output?:{type:string}[]}).output?.filter(x=>x.type==='message'),null,2));return response;
  },onUsage:u=>{inputTokens+=u.input_tokens;outputTokens+=u.output_tokens;}}),
 });
 if(!reply.changes.length)throw new Error('No edit: '+reply.message);
 const built=engine.build(readDesign(JSON.stringify(reply.design)));
 if(built.issues.some(i=>i.level==='error'))throw new Error(JSON.stringify(built.issues));
 await writeFile(`${out}/frame.oshinest.json`,JSON.stringify(reply.design,null,2));
 for(const format of ['3mf','glb','usdz'] as const)await writeFile(`${out}/frame.${format==='3mf'?'zip':format}`,exportDesign(reply.design,built,format));
 await writeFile(`${out}/result.json`,JSON.stringify({passed:true,geometryRepaired,message:reply.message,parts:built.parts.map(p=>({id:p.id,size:p.printSize,volume:p.volume,triangles:p.indices.length/3})),issues:built.issues},null,2));
 console.log(JSON.stringify({passed:true,calls,geometryRepaired,parts:built.parts.length,milliseconds:performance.now()-start}));
}catch(e){await writeFile(`${out}/result.json`,JSON.stringify({passed:false,error:e instanceof Error?e.message:String(e),diagnostic:e&&typeof e==='object'&&'diagnostic'in e?e.diagnostic:undefined},null,2));console.log(JSON.stringify({passed:false,calls}));}
finally{engine.clear();await writeFile(`${out}/request.json`,JSON.stringify({model,message,imageAttached:images.length>0,input:arg('input'),calls,repairs,inputTokens,outputTokens,milliseconds:Math.round(performance.now()-start)},null,2));}

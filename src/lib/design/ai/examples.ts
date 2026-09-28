import type { ModelProgram } from "../program.ts";
export const decoratedChair: ModelProgram = {
  id: "model-1", name: "曲がった脚と唐草飾りの椅子", x: 10, y: 10, color: "#bb8844", size: [65, 65, 105],
  source: `// Seat, four curved legs, scalloped back and repeated scrolls. Units: mm.
let chair = move(box([50,45,6]), [5,5,30]);
for (let leg=0; leg<4; leg++) {
  const x = leg%2===0 ? 10 : 50;
  const y = leg<2 ? 10 : 44;
  const rings=[];
  for (let j=0; j<9; j++) {
    const t=j/8;
    const ring=[];
    for (let i=0; i<12; i++) {
      const a=i*2*Math.PI/12;
      const r=2.5+1.2*Math.sin(t*Math.PI);
      ring.push([x+3*Math.sin(t*2*Math.PI)+r*Math.cos(a), y+r*Math.sin(a), 32*t]);
    }
    rings.push(ring);
  }
  chair=union(chair,loft(rings));
}
const outline=[[0,0],[50,0],[50,48],[44,50],[40,58],[32,55],[25,64],[18,55],[10,58],[6,50],[0,48]];
chair=union(chair,move(rotate(extrude(outline,5),[90,0,0]),[5,49,34]));
for(let motif=0;motif<5;motif++) {
  const path=[];
  for(let j=0;j<18;j++) {
    const a=j*1.6*Math.PI/17;
    const r=4-2*j/17;
    path.push([12+motif*9+r*Math.cos(a),43.5,65+r*Math.sin(a)]);
  }
  chair=union(chair,tube(path,1.5));
}
return chair;`,
};
export const curvedArmor: ModelProgram = {
  id: "model-1", name: "波形の紋様を持つ湾曲した装甲", x: 10, y: 10, color: "#7489aa", size: [60, 40, 75],
  source: `// Parametric curved armor shell with a changing, pointed outline.
const rings=[];
for(let j=0;j<17;j++) {
  const t=j/16;
  const ring=[];
  const width=4+22*Math.sin(Math.PI*(0.1+0.85*t));
  for(let i=0;i<24;i++) {
    const a=i*2*Math.PI/24;
    ring.push([30+width*Math.cos(a),8+22*t*t+3*Math.sin(a),70*t]);
  }
  rings.push(ring);
}
let armor=loft(rings);
for(let side=0;side<2;side++) {
  const path=[];
  for(let j=0;j<18;j++) {
    const t=0.12+0.75*j/17;
    path.push([30+(side===0?-1:1)*8*Math.sin(Math.PI*t),8+22*t*t-2.4,70*t]);
  }
  armor=union(armor,tube(path,1.5));
}
return armor;`,
};

"use client";

import { Button } from "@/components/ui/button";
import type { Design } from "@/lib/design/document";
import type { ModelProgram } from "@/lib/design/program";
import type { Composite } from "@/lib/design/composite";
import { NumberField, ColorField } from "./fields";

export function CustomPartsEditor({ design, update }: { design: Design; update: (design: Design) => boolean }) {
  const edit = (value: Composite) => update({ ...design, custom: design.custom.map((p) => p.id === value.id ? value : p) });
  const editProgram = (value: ModelProgram) => update({ ...design, programs: design.programs.map((p) => p.id === value.id ? value : p) });
  return <fieldset className="border-t border-line pt-3">
    <legend className="pr-3 font-semibold">自由形状の部品</legend>
    <p className="mb-3 text-sm text-muted-foreground">AIに「唐草飾りの椅子」「湾曲した装甲」などを頼めます。形を作った後も、チャットで装飾や曲線を変更できます。</p>
    {design.programs.map((p) => <details key={p.id} className="mt-3 border-t border-line pt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{p.name}</summary>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={`${p.name}の左右位置`} value={p.x} min={0} max={400} onChange={(x) => editProgram({ ...p, x })} />
        <NumberField label={`${p.name}の前後位置`} value={p.y} min={0} max={400} onChange={(y) => editProgram({ ...p, y })} />
      </div>
      <ColorField label={`${p.name}の色`} value={p.color} onChange={(color) => editProgram({ ...p, color })} />
      <Button type="button" size="sm" variant="outline" onClick={() => update({ ...design, programs: design.programs.filter((part) => part.id !== p.id) })}>{p.name}を削除</Button>
    </details>)}
    {design.custom.map((p) => <details key={p.id} className="mt-3 border-t border-line pt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{p.name}</summary>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={`${p.name}の左右位置`} value={p.x} min={0} max={400} onChange={(x) => edit({ ...p, x })} />
        <NumberField label={`${p.name}の前後位置`} value={p.y} min={0} max={400} onChange={(y) => edit({ ...p, y })} />
      </div>
      <ColorField label={`${p.name}の色`} value={p.color} onChange={(color) => edit({ ...p, color })} />
      <Button type="button" size="sm" variant="outline" onClick={() => update({ ...design, custom: design.custom.filter((part) => part.id !== p.id) })}>{p.name}を削除</Button>
    </details>)}
  </fieldset>;
}

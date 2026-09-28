"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { furnitureLabels, type Design, type Furniture } from "@/lib/design/document";
import { newFurniture } from "@/lib/design/furniture";
import { NumberField, ColorField } from "./fields";

export function FurnitureEditor({ design, update }: { design: Design; update: (d: Design) => boolean }) {
  const [kind, setKind] = useState<Furniture["kind"]>("shelf");
  const [error, setError] = useState("");
  const edit = (f: Furniture) => update({ ...design, furniture: design.furniture.map((old) => old.id === f.id ? f : old) });
  return <fieldset className="border-t border-line pt-3">
    <legend className="pr-3 font-semibold">追加の家具・台座</legend>
    <p className="mb-3 text-sm text-muted-foreground">6個まで床に配置できます。丸い台座は幅と奥行きが同じなら真円です。</p>
    <label className="flex flex-col gap-1 text-sm font-medium">追加する家具
      <select aria-label="追加する家具" value={kind} onChange={(e) => setKind(e.target.value as Furniture["kind"])} className="min-h-11 border border-line bg-white px-3">
        {Object.entries(furnitureLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <Button type="button" variant="outline" className="mt-2" disabled={design.furniture.length >= 6} onClick={() => {
      try { const added = newFurniture(design, kind); if (update({ ...design, furniture: [...design.furniture, added] })) setError(""); }
      catch (e) { setError(e instanceof Error ? e.message : "家具を追加できません。"); }
    }}>家具を追加</Button>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    {design.furniture.map((f) => <details key={f.id} className="mt-3 border-t border-line pt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{f.name}</summary>
      <label className="mb-3 flex flex-col gap-1 text-sm">家具の名前<Input aria-label={`${f.name}の名前`} key={f.name} defaultValue={f.name} maxLength={40} onBlur={(e) => { if (!edit({ ...f, name: e.target.value })) e.currentTarget.value = f.name; }} /></label>
      <div className="grid grid-cols-2 gap-3">
        {(["width", "depth", "height", "x", "y"] as const).map((key, i) => <NumberField key={key} label={`${f.name}の${["幅", "奥行き", "高さ", "左右位置", "前後位置"][i]}`} value={f[key]} min={i >= 3 ? 0 : key === "height" ? 10 : 20} max={i >= 3 ? 400 : 200} onChange={(value) => edit({ ...f, [key]: value })} />)}
      </div>
      <ColorField label={`${f.name}の色`} value={f.color} onChange={(color) => edit({ ...f, color })} />
      <Button type="button" variant="outline" size="sm" onClick={() => update({ ...design, furniture: design.furniture.filter((old) => old.id !== f.id) })}>{f.name}を削除</Button>
    </details>)}
  </fieldset>;
}

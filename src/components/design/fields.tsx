"use client";

import { Input } from "@/components/ui/input";

export function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => boolean | void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
    {label}<span className="flex items-center gap-2">
      <Input key={value} aria-label={label} type="number" inputMode="decimal" defaultValue={value} min={min} max={max} step="0.5" className="tabular-nums"
        onBlur={(e) => {
          const next = e.currentTarget.valueAsNumber;
          if (onChange(next) === false || !Number.isFinite(next)) e.currentTarget.value = String(value);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">mm</span>
    </span>
  </label>;
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-brand" />{label}</label>;
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return <label className="flex min-h-11 items-center justify-between gap-3 text-sm">{label}<input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-16 cursor-pointer border border-line bg-white p-1" /></label>;
}

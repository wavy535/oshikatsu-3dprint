"use client";

import { Input } from "@/components/ui/input";
import { useState } from "react";

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => boolean | void;
}) {
  const [draft, setDraft] = useState({ source: value, text: String(value) });
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <span className="flex items-center gap-2">
        <Input
          aria-label={label}
          type="number"
          inputMode="decimal"
          value={draft.source === value ? draft.text : String(value)}
          min={min}
          max={max}
          step="0.5"
          className="tabular-nums"
          onChange={(e) => {
            const next = e.currentTarget.valueAsNumber;
            const accepted =
              Number.isFinite(next) &&
              next >= min &&
              next <= max &&
              onChange(next) !== false;
            setDraft({
              source: accepted ? next : value,
              text: e.currentTarget.value,
            });
          }}
          onBlur={(e) => {
            const next = e.currentTarget.valueAsNumber;
            const accepted = Number.isFinite(next) && onChange(next) !== false;
            setDraft({
              source: accepted ? next : value,
              text: String(accepted ? next : value),
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">
          mm
        </span>
      </span>
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-brand"
      />
      {label}
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      {label}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-16 cursor-pointer border border-line bg-white p-1"
      />
    </label>
  );
}

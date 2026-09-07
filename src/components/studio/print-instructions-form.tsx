"use client";

import { useActionState, useState } from "react";
import { Info } from "lucide-react";

import { savePrintInstructionsAction, type StepActionState } from "@/lib/works/step-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: StepActionState = { error: null };

const ORIENTATIONS = [
  { value: "flat", label: "寝かせる", hint: "板状のパーツ向け。層間剥離を避けられる" },
  { value: "upright", label: "立てる", hint: "接地面が小さいのでサポートが要ることが多い" },
  { value: "tilted", label: "傾ける", hint: "サポート跡を見えない面へ逃がす" },
  { value: "as_is", label: "データのまま", hint: "既に向きを決めてある場合" },
] as const;

const SUPPORTS = [
  { value: "none", label: "なし" },
  { value: "auto", label: "自動" },
  { value: "custom", label: "指示あり" },
] as const;

type Part = {
  instructionId: string;
  name: string;
  bbox: string;
  orientation: string;
  support: string;
  noRotate: boolean;
  note: string | null;
};

type Slot = {
  id: string;
  slotIndex: number;
  sourceName: string;
  sourceHex: string;
  filamentId: string | null;
};

type Filament = {
  id: string;
  material: string;
  color_name: string;
  color_hex: string;
  stock_grams: number;
};

/**
 * Figma ②出品フロー「STEP2 印刷指示」。
 * ここで決めた内容は運営の印刷ジョブ詳細にそのまま届く。
 */
export function PrintInstructionsForm({
  workId,
  parts: initialParts,
  slots: initialSlots,
  filaments,
}: {
  workId: string;
  parts: Part[];
  slots: Slot[];
  filaments: Filament[];
}) {
  const [state, formAction, pending] = useActionState(savePrintInstructionsAction, initialState);
  const [parts, setParts] = useState(initialParts);
  const [slots, setSlots] = useState(initialSlots);

  const payload = JSON.stringify({
    workId,
    instructions: parts.map((p) => ({
      id: p.instructionId,
      orientation: p.orientation,
      support: p.support,
      noRotate: p.noRotate,
      note: p.note?.trim() ? p.note.trim() : null,
    })),
    slots: slots.map((s) => ({ id: s.id, filamentId: s.filamentId })),
  });

  function updatePart(id: string, patch: Partial<Part>) {
    setParts((prev) => prev.map((p) => (p.instructionId === id ? { ...p, ...patch } : p)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <p className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-[12px] leading-5 text-accent-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        ここで決めた置き方とサポートは、運営の印刷ジョブ詳細にそのまま届きます。
        解析結果から既定値を入れてあるので、問題なければそのまま進めます。
      </p>

      {parts.map((part) => (
        <section key={part.instructionId} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold text-ink">{part.name}</h2>
            <span className="num text-[11px] text-muted-foreground">{part.bbox}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">置き方</p>
            <div className="flex flex-wrap gap-2">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={part.orientation === o.value}
                  onClick={() => updatePart(part.instructionId, { orientation: o.value })}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    part.orientation === o.value
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-white hover:border-brand/40"
                  )}
                >
                  <span className="text-[12px] font-semibold text-ink">{o.label}</span>
                  <span className="text-[10.5px] text-muted-foreground">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">サポート</span>
              <div className="flex gap-1">
                {SUPPORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={part.support === s.value}
                    onClick={() => updatePart(part.instructionId, { support: s.value })}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                      part.support === s.value
                        ? "bg-brand text-white"
                        : "bg-ground text-muted-foreground hover:text-ink"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={part.noRotate}
                onChange={(e) => updatePart(part.instructionId, { noRotate: e.target.checked })}
                className="size-4 accent-brand"
              />
              回転禁止（この向きのまま印刷する）
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`note-${part.instructionId}`}
              className="text-[11px] font-semibold text-muted-foreground"
            >
              運営へのメモ（任意）
            </label>
            <textarea
              id={`note-${part.instructionId}`}
              rows={2}
              maxLength={500}
              value={part.note ?? ""}
              onChange={(e) => updatePart(part.instructionId, { note: e.target.value })}
              placeholder="はめ合いがきついので、サポートは内側に付けないでください など"
              className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
            />
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <h2 className="text-[13px] font-semibold text-ink">色の割り当て</h2>
        {slots.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            このデータは色情報を持っていません（STLは単色）。運営の在庫から1色で印刷します。
          </p>
        ) : (
          slots.map((slot) => (
            <div key={slot.id} className="flex flex-wrap items-center gap-3">
              <span
                className="size-5 rounded-full border border-line"
                style={{ backgroundColor: slot.sourceHex }}
                aria-hidden
              />
              <span className="text-[12.5px] text-ink">
                スロット{slot.slotIndex}：{slot.sourceName}
              </span>
              <select
                value={slot.filamentId ?? ""}
                onChange={(e) =>
                  setSlots((prev) =>
                    prev.map((s) =>
                      s.id === slot.id ? { ...s, filamentId: e.target.value || null } : s
                    )
                  )
                }
                className="ml-auto h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink outline-none focus:border-brand"
              >
                <option value="">運営におまかせ</option>
                {filaments.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.material} / {f.color_name}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </section>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "保存しています..." : "作品情報へ進む"}
      </Button>
    </form>
  );
}

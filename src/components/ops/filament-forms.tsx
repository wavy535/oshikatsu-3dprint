"use client";

import { useActionState, useState } from "react";
import { PackagePlus, Plus } from "lucide-react";

import { adjustFilamentStockAction, createFilamentAction, toggleFilamentActiveAction } from "@/lib/ops/inventory-actions";
import { type OpsActionState } from "@/lib/ops/action-state";
import { Button } from "@/components/ui/button";

const initial: OpsActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand";

function Notice({ state }: { state: OpsActionState }) {
  if (state.error) return <p className="text-[11px] text-danger">{state.error}</p>;
  if (state.message) return <p className="text-[11px] text-ok">{state.message}</p>;
  return null;
}

type Filament = { id: string; material: string; color_name: string; color_hex: string; is_active: boolean };

/**
 * 在庫の増減。在庫数を直接書かず、台帳（filament_ledger）に積む。
 * 対象を一覧で選んで、補充・廃棄・棚卸し調整のどれかで記録する。
 */
export function StockAdjustForm({ filaments }: { filaments: Filament[] }) {
  const [state, action, pending] = useActionState(adjustFilamentStockAction, initial);
  const [reason, setReason] = useState<"restock" | "waste" | "adjust">("restock");

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">フィラメント</span>
        <select name="filamentId" required className={FIELD} defaultValue="">
          <option value="" disabled>
            選んでください
          </option>
          {filaments.map((f) => (
            <option key={f.id} value={f.id}>
              {f.material}・{f.color_name}
              {f.is_active ? "" : "（停止中）"}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">区分</span>
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className={FIELD}
          >
            <option value="restock">補充（＋）</option>
            <option value="waste">廃棄（−）</option>
            <option value="adjust">棚卸し調整（＋）</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">グラム</span>
          <input name="grams" type="number" min="1" step="1" required placeholder="1000" className={FIELD} />
        </label>
      </div>

      <Button type="submit" disabled={pending} className="w-full" variant={reason === "waste" ? "destructive" : "default"}>
        <PackagePlus className="size-3.5" aria-hidden />
        台帳に記録
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** 新しい素材・色の登録。 */
export function NewFilamentForm() {
  const [state, action, pending] = useActionState(createFilamentAction, initial);
  const [hex, setHex] = useState("#F7F5F0");

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">素材</span>
          <select name="material" defaultValue="PLA" className={FIELD}>
            {["PLA", "PETG", "ABS", "TPU"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">色の名前</span>
          <input name="colorName" required maxLength={30} placeholder="ラベンダー" className={FIELD} />
        </label>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">色</span>
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="size-9 cursor-pointer rounded-lg border border-line bg-white p-1"
            aria-label="色を選ぶ"
          />
          <input type="hidden" name="colorHex" value={hex} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">単価（円/g）</span>
          <input name="pricePerGram" type="number" step="0.1" min="0" defaultValue="3.5" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">初期在庫（g）</span>
          <input name="stockGrams" type="number" min="0" step="1" defaultValue="0" className={FIELD} />
        </label>
      </div>

      <Button type="submit" disabled={pending} variant="outline" className="w-full">
        <Plus className="size-3.5" aria-hidden />
        フィラメントを追加
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** 一覧の行に置く「使う／停止」の切り替え。 */
export function ToggleActiveButton({ filamentId, isActive }: { filamentId: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(toggleFilamentActiveAction, initial);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-0.5">
      <input type="hidden" name="filamentId" value={filamentId} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line bg-white px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-ground disabled:opacity-50"
      >
        {isActive ? "停止する" : "再開する"}
      </button>
      {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

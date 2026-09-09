"use client";

import { useActionState } from "react";

import { processPayoutAction } from "@/lib/ops/sales-actions";
import { type OpsActionState } from "@/lib/ops/action-state";
import type { PayoutStatus } from "@/types/db";

const initial: OpsActionState = { error: null };

/** 払込申請の処理ボタン。申請中 → 処理中 → 振込済み、または却下。 */
export function PayoutActions({ id, status }: { id: string; status: PayoutStatus }) {
  const [state, action, pending] = useActionState(processPayoutAction, initial);
  if (status === "paid" || status === "rejected") return null;

  const btn = "rounded-md px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50";
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-1.5">
        {status === "requested" && (
          <button type="submit" name="next" value="processing" disabled={pending} className={`${btn} border border-line bg-white text-ink hover:bg-ground`}>
            処理中にする
          </button>
        )}
        <button type="submit" name="next" value="paid" disabled={pending} className={`${btn} bg-brand text-white hover:opacity-90`}>
          振込済みにする
        </button>
        <button type="submit" name="next" value="rejected" disabled={pending} className={`${btn} border border-danger/40 bg-white text-danger hover:bg-danger-bg`}>
          却下
        </button>
      </div>
      {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Check, Pause, Play, RotateCcw } from "lucide-react";

import {
  advanceBatchAction,
  finishPrintJobAction,
  pausePrintJobAction,
  startPrintJobAction,
  startReprintAction,
  type OpsActionState,
} from "@/lib/ops/actions";
import { Button } from "@/components/ui/button";
import type { PrintJobStatus } from "@/types/db";

const initial: OpsActionState = { error: null };

type Printer = { id: string; code: string; model_name: string };
type Filament = {
  id: string;
  material: string;
  color_name: string;
  stock_grams: number;
};

const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand";

function Notice({ state }: { state: OpsActionState }) {
  if (state.error) return <p className="text-[11px] text-danger">{state.error}</p>;
  if (state.message) return <p className="text-[11px] text-ok">{state.message}</p>;
  return null;
}

/**
 * ジョブ詳細の上段の操作。
 *
 * 進められる先はステータスで決まる。運営が注文ステータスを触ることは無い
 * （印刷ジョブと発送記録から導出される・設計判断9）。
 */
export function JobControls({
  jobId,
  status,
  batchDone,
  batchCount,
  printers,
  defaultPrinterId,
}: {
  jobId: string;
  status: PrintJobStatus;
  batchDone: number;
  batchCount: number;
  printers: Printer[];
  defaultPrinterId: string | null;
}) {
  const [startState, start, starting] = useActionState(startPrintJobAction, initial);
  const [pauseState, pause, pausing] = useActionState(pausePrintJobAction, initial);
  const [batchState, batch, batching] = useActionState(advanceBatchAction, initial);
  const [reprintState, reprint, reprinting] = useActionState(startReprintAction, initial);

  const state = startState.error
    ? startState
    : pauseState.error
      ? pauseState
      : batchState.error
        ? batchState
        : reprintState;

  const printing = status === "printing" || status === "reprinting";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {status === "queued" && (
          <form action={start} className="flex items-center gap-2">
            <input type="hidden" name="jobId" value={jobId} />
            <select
              name="printerId"
              aria-label="プリンタ"
              defaultValue={defaultPrinterId ?? printers[0]?.id ?? ""}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand"
            >
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}（{p.model_name}）
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={starting}>
              <Play className="size-3.5" aria-hidden />
              印刷を開始
            </Button>
          </form>
        )}

        {printing && batchCount > 1 && batchDone < batchCount && (
          <form action={batch}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button type="submit" size="sm" variant="outline" disabled={batching}>
              バッチ {batchDone + 1} を完了
            </Button>
          </form>
        )}

        {printing && (
          <form action={pause}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button type="submit" size="sm" variant="outline" disabled={pausing}>
              <Pause className="size-3.5" aria-hidden />
              印刷を中断
            </Button>
          </form>
        )}

        {status === "qc_failed" && (
          <form action={reprint} className="flex items-center gap-2">
            <input type="hidden" name="jobId" value={jobId} />
            <select
              name="printerId"
              aria-label="プリンタ"
              defaultValue={defaultPrinterId ?? printers[0]?.id ?? ""}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand"
            >
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}（{p.model_name}）
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={reprinting}>
              <RotateCcw className="size-3.5" aria-hidden />
              再印刷を開始
            </Button>
          </form>
        )}
      </div>
      <Notice state={state} />
    </div>
  );
}

/**
 * 印刷実績の記録。
 *
 * 実使用グラムは選んだフィラメントの台帳に消費として積まれ、在庫が減る。
 * 推定値を初期値に入れてあるが、必ず実測に直してもらう前提。
 */
export function JobFinishForm({
  jobId,
  estGrams,
  estHours,
  filaments,
  defaultFilamentId,
}: {
  jobId: string;
  estGrams: number | null;
  estHours: number | null;
  filaments: Filament[];
  defaultFilamentId: string | null;
}) {
  const [state, action, pending] = useActionState(finishPrintJobAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">実使用フィラメント（g）</span>
          <input
            name="actualGrams"
            type="number"
            step="0.1"
            min="0"
            required
            defaultValue={estGrams ?? ""}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">実印刷時間（h）</span>
          <input
            name="actualHours"
            type="number"
            step="0.1"
            min="0"
            required
            defaultValue={estHours ?? ""}
            className={FIELD}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">失敗・再印刷（回）</span>
        <input name="failureCount" type="number" min="0" defaultValue={0} className={FIELD} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">消費するフィラメント</span>
        <select name="filamentId" defaultValue={defaultFilamentId ?? ""} className={FIELD}>
          <option value="">在庫から引かない</option>
          {filaments.map((f) => (
            <option key={f.id} value={f.id}>
              {f.material}・{f.color_name}（在庫 {(f.stock_grams / 1000).toFixed(1)}kg）
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        <Check className="size-3.5" aria-hidden />
        実績を保存して検品待ちへ
      </Button>
      <Notice state={state} />
    </form>
  );
}

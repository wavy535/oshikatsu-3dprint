"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { createCustomRequestAction, type CustomOrderActionState } from "@/lib/custom-orders/actions";
import { BUDGET_OPTIONS, DEADLINE_OPTIONS, NUI_SIZE_OPTIONS } from "@/lib/custom-orders/labels";
import { Button } from "@/components/ui/button";

const initial: CustomOrderActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[12px] text-ink outline-none focus:border-brand";

/** Figma ③やりとり「オーダーメイド相談フォーム 48:900」。 */
export function CustomRequestForm({ creatorId, workId }: { creatorId: string; workId?: string }) {
  const [state, action, pending] = useActionState(createCustomRequestAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="creatorId" value={creatorId} />
      {workId && <input type="hidden" name="workId" value={workId} />}

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          ご相談内容
          <span className="rounded bg-danger-bg px-1 text-[8.5px] font-semibold text-danger">必須</span>
        </span>
        <textarea
          name="message"
          rows={5}
          required
          minLength={20}
          maxLength={2000}
          placeholder="サイズ・カラー・世界観など、ご希望を詳しくお書きください"
          className={FIELD}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-ink">ご希望の対応ぬいサイズ</span>
        <div className="flex flex-wrap gap-2">
          {NUI_SIZE_OPTIONS.map((s, i) => (
            <label key={s} className="cursor-pointer">
              <input type="radio" name="nuiSize" value={s} defaultChecked={i === 1} className="peer sr-only" />
              <span className="inline-block rounded-full border border-line px-3 py-1.5 text-[11px] text-ink peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">
                {s}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink">ご予算目安</span>
          <select name="budget" defaultValue={BUDGET_OPTIONS[1]} className={FIELD}>
            {BUDGET_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink">納期のご希望</span>
          <select name="deadline" defaultValue={DEADLINE_OPTIONS[0]} className={FIELD}>
            {DEADLINE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <p className="text-[10.5px] text-muted-foreground">相談内容はメッセージとしてクリエイターに送信されます</p>
        <span className="flex-1" />
        <Button type="submit" size="lg" disabled={pending}>
          <Send className="size-4" aria-hidden />
          相談を送信する
        </Button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

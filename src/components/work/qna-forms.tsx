"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquarePlus, Send } from "lucide-react";

import { answerQuestionAction, askQuestionAction, type QnaActionState } from "@/lib/qna/actions";
import { Button } from "@/components/ui/button";

const initial: QnaActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[12px] text-ink outline-none focus:border-brand";

/** 質問フォーム。「公開されます」を入口に明示する。 */
export function AskQuestionForm({ workId, loggedIn }: { workId: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  // 送れたら入力を消して閉じる（effect ではなくアクションの結果で行う）
  const [state, action, pending] = useActionState(
    async (prev: QnaActionState, formData: FormData) => {
      const result = await askQuestionAction(prev, formData);
      if (result.message) {
        ref.current?.reset();
        setOpen(false);
      }
      return result;
    },
    initial
  );

  if (!loggedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/works/${workId}/qa`)}`}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 hover:bg-ground"
      >
        <MessageSquarePlus className="size-4 text-brand" aria-hidden />
        <span className="text-[12.5px] font-semibold text-ink">この作品について質問する</span>
        <span className="text-[10.5px] text-muted-foreground">ログインが必要です</span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 text-left">
        <MessageSquarePlus className="size-4 text-brand" aria-hidden />
        <span className="text-[12.5px] font-semibold text-ink">この作品について質問する</span>
        <span className="text-[10.5px] text-muted-foreground">公開されます</span>
      </button>
      {open && (
        <form ref={ref} action={action} className="flex flex-col gap-2 pt-1">
          <input type="hidden" name="workId" value={workId} />
          <textarea name="question" rows={3} required minLength={5} maxLength={500} placeholder="例：12cmのぬい用に中間サイズは作れますか？" className={FIELD} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              <Send className="size-3.5" aria-hidden />
              質問を投稿
            </Button>
          </div>
          {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
        </form>
      )}
      {state.message && <p className="text-[11px] text-ok">{state.message}</p>}
    </div>
  );
}

/** クリエイターの回答フォーム（未回答の質問に出す）。 */
export function AnswerForm({ threadId, workId }: { threadId: string; workId: string }) {
  const [state, action, pending] = useActionState(answerQuestionAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-2">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="workId" value={workId} />
      <textarea name="answer" rows={2} required maxLength={2000} placeholder="回答を書く（公開されます）" className={FIELD} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>回答する</Button>
        {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
        {state.message && <span className="text-[11px] text-ok">{state.message}</span>}
      </div>
    </form>
  );
}

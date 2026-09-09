"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { sendMessageAction, type MessageActionState } from "@/lib/messages/actions";
import { Button } from "@/components/ui/button";

const initial: MessageActionState = { error: null };

/** 送信欄。送れたら入力を空にする。Ctrl+Enter でも送れる。 */
export function MessageComposer({ recipientId, orderId, latestHref }: { recipientId: string; orderId?: string; latestHref?: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const handledSentAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.sentAt && handledSentAt.current !== state.sentAt) {
      handledSentAt.current = state.sentAt;
      formRef.current?.reset();
      if (latestHref) router.replace(latestHref);
    }
  }, [state.sentAt, latestHref, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
      <input type="hidden" name="recipientId" value={recipientId} />
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <div className="flex items-end gap-2">
        <textarea
          name="body"
          rows={2}
          required
          maxLength={2000}
          placeholder="メッセージを入力"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="flex-1 resize-none rounded-2xl border border-line bg-ground px-3.5 py-2.5 text-[12px] text-ink outline-none focus:border-brand"
        />
        <Button type="submit" disabled={pending} className="rounded-full px-4">
          <Send className="size-3.5" aria-hidden />
          送信
        </Button>
      </div>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

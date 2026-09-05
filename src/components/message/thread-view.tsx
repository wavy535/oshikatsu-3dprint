"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { closeThread, markThreadRead, sendMessage } from "@/features/messages/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  is_admin_note: boolean;
  created_at: string;
  deleted_at: string | null;
};

export function ThreadView({
  threadId,
  currentUserId,
  messages,
  isClosed,
  canClose,
}: {
  threadId: string;
  currentUserId: string;
  messages: Message[];
  isClosed: boolean;
  canClose: boolean;
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [closed, setClosed] = useState(isClosed);

  useEffect(() => {
    markThreadRead(threadId);
  }, [threadId]);

  function handleSend() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await sendMessage({ threadId, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
    });
  }

  function handleClose() {
    if (!window.confirm("このスレッドをクローズしますか？")) return;
    startTransition(async () => {
      const result = await closeThread(threadId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setClosed(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  m.is_admin_note
                    ? "bg-amber-100 text-amber-900"
                    : mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                }`}
              >
                {m.deleted_at ? (
                  <p className="italic opacity-70">このメッセージは削除されました</p>
                ) : (
                  <p className="whitespace-pre-wrap">{m.body}</p>
                )}
                <p className="mt-1 text-right text-xs opacity-70">
                  {new Date(m.created_at).toLocaleString("ja-JP")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="text-sm text-muted-foreground">このスレッドはクローズされています。</p>
      ) : (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Textarea
            rows={3}
            placeholder="メッセージを入力"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />
          <div className="flex justify-between">
            <Button size="sm" disabled={isPending} onClick={handleSend}>
              送信
            </Button>
            {canClose && (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={handleClose}>
                クローズする
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

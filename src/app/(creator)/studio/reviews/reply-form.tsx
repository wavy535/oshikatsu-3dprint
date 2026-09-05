"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { replyToReview } from "@/features/reviews/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReplyForm({ reviewId, existingReply }: { reviewId: string; existingReply: string | null }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(existingReply ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!body.trim()) {
      toast.error("返信内容を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await replyToReview({ reviewId, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("返信を保存しました");
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        {existingReply ? "返信を編集" : "返信する"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handleSave}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}

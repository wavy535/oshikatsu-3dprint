"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startPrePurchaseThread } from "@/features/messages/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AskQuestionForm({
  productId,
  isLoggedIn,
}: {
  productId: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function openForm() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setOpen(true);
  }

  function handleSubmit() {
    if (!body.trim()) {
      toast.error("質問内容を入力してください");
      return;
    }
    startTransition(async () => {
      const result = await startPrePurchaseThread({ productId, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("質問を送信しました");
      router.push(`/mypage/messages/${result.data.threadId}`);
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={openForm}>
        作品について質問する
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Textarea
        rows={3}
        placeholder="サイズや素材についての質問など"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          送信
        </Button>
      </div>
    </div>
  );
}

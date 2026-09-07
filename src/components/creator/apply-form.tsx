"use client";

import { useActionState } from "react";

import { applyForCreatorAction, type CreatorApplyActionState } from "@/lib/creator/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: CreatorApplyActionState = { error: null };

export function CreatorApplyForm() {
  const [state, formAction, pending] = useActionState(applyForCreatorAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm text-muted-foreground">
        申請を受け付けました。運営による審査完了までしばらくお待ちください。
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">活動内容・投稿予定の作品について</Label>
        <textarea
          id="message"
          name="message"
          rows={6}
          required
          placeholder="例：Blenderで推しぬい用の台座や小物を制作しています。まずは台座シリーズから投稿予定です。"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "送信中..." : "クリエイター申請を送信する"}
      </Button>
    </form>
  );
}

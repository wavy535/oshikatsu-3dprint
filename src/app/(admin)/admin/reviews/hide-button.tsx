"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { hideReview } from "@/features/reviews/actions";
import { Button } from "@/components/ui/button";

export function HideButton({ reviewId }: { reviewId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("このレビューを非公開にしますか？")) return;
    startTransition(async () => {
      const result = await hideReview({ reviewId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("非公開にしました");
    });
  }

  return (
    <Button size="sm" variant="ghost" disabled={isPending} onClick={handleClick}>
      非公開にする
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { submitForReview } from "@/features/products/actions";
import { Button } from "@/components/ui/button";

export function SubmitReviewButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await submitForReview(productId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("審査に申請しました");
    });
  }

  return (
    <Button disabled={isPending} onClick={handleClick}>
      {isPending ? "申請中..." : "審査に申請する"}
    </Button>
  );
}

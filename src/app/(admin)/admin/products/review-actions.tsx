"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { reviewProduct } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";

export function ReviewActions({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      const result = await reviewProduct({ id: productId, decision: "approve" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("公開しました");
    });
  }

  function handleReject() {
    const reason = window.prompt("却下理由を入力してください");
    if (!reason) return;
    startTransition(async () => {
      const result = await reviewProduct({ id: productId, decision: "reject", reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("却下しました");
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={isPending} onClick={handleApprove}>
        公開する
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={handleReject}>
        却下する
      </Button>
    </div>
  );
}

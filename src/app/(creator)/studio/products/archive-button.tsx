"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { archiveProduct } from "@/features/products/actions";
import { Button } from "@/components/ui/button";

export function ArchiveButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("この作品を販売停止しますか？")) return;
    startTransition(async () => {
      const result = await archiveProduct(productId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("販売を停止しました");
    });
  }

  return (
    <Button size="sm" variant="ghost" disabled={isPending} onClick={handleClick}>
      販売停止
    </Button>
  );
}

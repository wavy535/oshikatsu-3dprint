"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmDelivery, requestCancel } from "@/features/orders/actions";
import { Button } from "@/components/ui/button";

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmDelivery(orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("受取確認しました");
    });
  }

  function handleCancel() {
    const reason = window.prompt("キャンセル理由を入力してください");
    if (!reason) return;
    setCancelling(true);
    startTransition(async () => {
      const result = await requestCancel(orderId, reason);
      setCancelling(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("キャンセルしました");
    });
  }

  return (
    <div className="flex gap-2">
      {status === "shipped" && (
        <Button disabled={isPending} onClick={handleConfirm}>
          受け取りました
        </Button>
      )}
      {(status === "pending_payment" || status === "paid") && (
        <Button variant="outline" disabled={isPending || cancelling} onClick={handleCancel}>
          キャンセルする
        </Button>
      )}
    </div>
  );
}

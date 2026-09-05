"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminCancelOrder, refundOrder, startPrinting } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function handleStartPrinting() {
    startTransition(async () => {
      const result = await startPrinting(orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("印刷を開始しました");
    });
  }

  function handleCancel() {
    const reason = window.prompt("キャンセル理由を入力してください");
    if (!reason) return;
    setBusy(true);
    startTransition(async () => {
      const result = await adminCancelOrder(orderId, reason);
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("キャンセルしました");
    });
  }

  function handleRefund() {
    if (!window.confirm("Stripeで全額返金しますか？")) return;
    setBusy(true);
    startTransition(async () => {
      const result = await refundOrder(orderId);
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("返金しました");
    });
  }

  return (
    <div className="flex gap-2">
      {status === "paid" && (
        <Button disabled={isPending} onClick={handleStartPrinting}>
          印刷開始
        </Button>
      )}
      {(status === "pending_payment" || status === "paid") && (
        <Button variant="outline" disabled={isPending || busy} onClick={handleCancel}>
          キャンセル
        </Button>
      )}
      {["paid", "printing", "shipped"].includes(status) && (
        <Button variant="destructive" disabled={isPending || busy} onClick={handleRefund}>
          返金
        </Button>
      )}
    </div>
  );
}

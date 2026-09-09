"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmDemoOrderAction, cancelUnpaidOrderAction, type CheckoutActionState,
} from "@/lib/checkout/actions";

const initial: CheckoutActionState = { error: null };

export function OrderControls({ orderId }: { orderId: string }) {
  const [confirm, confirmAction, confirming] = useActionState(confirmDemoOrderAction, initial);
  const [cancel, cancelAction, cancelling] = useActionState(cancelUnpaidOrderAction, initial);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">デモ注文として確定します。実際の請求は発生しません。</p>
      <div className="flex flex-wrap gap-2">
        <form action={confirmAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button disabled={confirming || cancelling}>{confirming ? "処理中…" : "デモ注文を確定する"}</Button>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button variant="outline" disabled={confirming || cancelling}>{cancelling ? "処理中…" : "注文を取り消す"}</Button>
        </form>
      </div>
      {(confirm.error || cancel.error) && <p role="alert" className="text-xs text-danger">{confirm.error || cancel.error}</p>}
    </div>
  );
}

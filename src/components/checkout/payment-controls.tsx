"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  resumeOrderPaymentAction, cancelUnpaidOrderAction, checkOrderPaymentAction,
  type CheckoutActionState,
} from "@/lib/checkout/actions";

const initial: CheckoutActionState = { error: null };

export function OrderPaymentControls({ orderId }: { orderId: string }) {
  const [resume, resumeAction, resuming] = useActionState(resumeOrderPaymentAction, initial);
  const [cancel, cancelAction, cancelling] = useActionState(cancelUnpaidOrderAction, initial);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={resumeAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button disabled={resuming || cancelling}>{resuming ? "確認中…" : "お支払いを再開する"}</Button>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <Button variant="outline" disabled={resuming || cancelling}>{cancelling ? "処理中…" : "未払いの注文を取り消す"}</Button>
        </form>
      </div>
      {(resume.error || cancel.error) && <p role="alert" className="text-xs text-danger">{resume.error || cancel.error}</p>}
    </div>
  );
}

export function PaymentConfirmation({ orderId, sessionId }: { orderId: string; sessionId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(checkOrderPaymentAction, initial);
  useEffect(() => {
    const form = new FormData();
    form.set("orderId", orderId);
    form.set("sessionId", sessionId);
    startTransition(() => action(form));
  }, [orderId, sessionId, action]);
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);
  return (
    <form action={action} className="flex flex-col items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button variant="outline" disabled={pending}>{pending ? "お支払いを確認中…" : "お支払い状況を更新する"}</Button>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

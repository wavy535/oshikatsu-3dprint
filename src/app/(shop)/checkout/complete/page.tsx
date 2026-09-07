import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";

import { getCompletedOrder } from "@/lib/checkout/queries";
import { getStripe } from "@/lib/payments/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "注文完了" };

/**
 * 注文完了。Stripe から戻ってきた場合は session を照会し、支払い済みなら
 * ここでも confirm_order_payment() を呼ぶ（webhook が遅れても画面が正しくなる。冪等）。
 */
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; session_id?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.order) notFound();

  const stripe = getStripe();
  if (stripe && sp.session_id) {
    const session = await stripe.checkout.sessions.retrieve(sp.session_id);
    const orderId = session.metadata?.order_id ?? session.client_reference_id;
    if (orderId === sp.order && session.payment_status === "paid") {
      const service = createServiceRoleClient();
      await service.rpc("confirm_order_payment", {
        p_order_id: sp.order,
        p_payment_ref: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
      });
    }
  }

  const order = await getCompletedOrder(sp.order);
  if (!order) notFound();

  const paid = order.status !== "payment_pending" && order.status !== "cancelled";

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center gap-5 px-6 py-12 text-center">
      {paid ? (
        <CheckCircle2 className="size-12 text-ok" aria-hidden />
      ) : (
        <Clock className="size-12 text-warn" aria-hidden />
      )}
      <h1 className="text-lg font-bold text-ink">
        {paid ? "ご注文ありがとうございます" : "お支払いの確認を待っています"}
      </h1>
      <p className="text-[12.5px] leading-5 text-muted-foreground">
        {paid
          ? "支払いを確認しました。運営が印刷・検品・発送を行います。進み具合は注文詳細で確認できます。"
          : "支払いが確認できると、印刷の準備に入ります。しばらくしてから注文詳細を開いてください。"}
      </p>

      <div className="w-full rounded-xl border border-line bg-white p-4 text-left">
        <p className="num text-[11px] text-muted-foreground">注文番号 #{order.id.slice(0, 8)}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {order.order_items.map((i) => (
            <li key={i.id} className="flex justify-between text-[12px]">
              <span className="text-ink">
                {i.works?.title ?? "作品"}{" "}
                <span className="num text-muted-foreground">
                  {i.size_label_snapshot} ×{i.quantity}
                </span>
              </span>
              <span className="num text-ink">{yen(i.unit_price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-2 text-[11.5px]">
          <div className="flex justify-between"><dt className="text-muted-foreground">印刷代行費</dt><dd className="num text-ink">{yen(order.print_cost_amount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">送料</dt><dd className="num text-ink">{yen(order.shipping_fee_amount)}</dd></div>
          <div className="flex justify-between pt-1"><dt className="font-semibold text-ink">合計</dt><dd className="num font-bold text-ink">{yen(order.total_amount)}</dd></div>
        </dl>
      </div>

      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/mypage/orders/${order.id}`}>注文詳細を見る</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/works">作品をさがす</Link>
        </Button>
      </div>
    </div>
  );
}

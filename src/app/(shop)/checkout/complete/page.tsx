import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";

import { getCompletedOrder } from "@/lib/checkout/queries";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "注文完了" };

/**
 * 注文完了。本人の注文の確定結果だけを表示する。
 */
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.order) notFound();

  const order = await getCompletedOrder(sp.order);
  if (!order) notFound();

  const confirmed = order.status !== "payment_pending" && order.status !== "cancelled";

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center gap-5 px-6 py-12 text-center">
      {confirmed ? (
        <CheckCircle2 className="size-12 text-ok" aria-hidden />
      ) : (
        <Clock className="size-12 text-warn" aria-hidden />
      )}
      <h1 className="text-lg font-bold text-ink">
        {confirmed ? "ご注文ありがとうございます" : order.status === "cancelled" ? "注文は取り消されました" : "注文はまだ確定していません"}
      </h1>
      <p className="text-[12.5px] leading-5 text-muted-foreground">
        {confirmed
          ? order.is_demo ? "デモ注文を受け付けました。実際の請求は発生していません。印刷・検品・発送の進み具合は注文詳細で確認できます。" : "注文を受け付けました。進み具合は注文詳細で確認できます。"
          : "注文詳細で現在の状態を確認できます。"}
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

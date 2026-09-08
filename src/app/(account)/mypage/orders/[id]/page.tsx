import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageIcon, Truck } from "lucide-react";

import { getMyOrder, ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { OrderStatusStepper } from "@/components/order/order-status-stepper";
import { ReviewForm } from "@/components/order/review-form";
import { OrderPaymentControls } from "@/components/checkout/payment-controls";

export const metadata = { title: "注文詳細" };

/**
 * Figma ①購入フロー「注文詳細 2085:1269」。
 * ステータスは印刷ジョブと発送記録から導出されたものを表示するだけで、
 * 画面からは書き換えない（設計判断9）。
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getMyOrder(id);
  if (!order) notFound();

  const items = order.order_items ?? [];
  const address = order.addresses;

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">注文詳細</h1>
        <span className="num text-[11.5px] text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString("ja-JP")} の注文
        </span>
        <Link href="/mypage/orders" className="ml-auto text-[11.5px] text-brand hover:underline">
          購入履歴へ戻る
        </Link>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <OrderStatusStepper status={order.status} />
        <p className="text-[12px] text-muted-foreground">
          現在の状態: <span className="text-ink">{ORDER_STATUS_LABEL[order.status]}</span>
        </p>
        {order.status === "payment_pending" && <OrderPaymentControls orderId={order.id} />}
        {order.tracking_number && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Truck className="size-3.5" aria-hidden />
            追跡番号 <span className="num text-ink">{order.tracking_number}</span>
            {order.shipped_at && (
              <span className="num">
                （{new Date(order.shipped_at).toLocaleDateString("ja-JP")} 発送）
              </span>
            )}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        {items.map((item) => {
          const image = workImageUrl(
            [...(item.works?.work_images ?? [])].sort(
              (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
            )[0]?.storage_path
          );
          return (
            <div key={item.id} className="flex flex-col gap-3">
              <div className="flex gap-3 rounded-xl border border-line bg-white p-4">
                <Link
                  href={`/works/${item.work_id}`}
                  className="size-20 shrink-0 overflow-hidden rounded-lg bg-ground"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-line" aria-hidden />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/works/${item.work_id}`}
                    className="truncate text-[13px] font-semibold text-ink hover:underline"
                  >
                    {item.works?.title}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {item.profiles?.display_name} ／ {item.size_label_snapshot} ／{" "}
                    <span className="num">{item.quantity}</span>点
                  </p>
                  <p className="num mt-auto text-[13px] font-bold text-ink">
                    {yen(item.unit_price * item.quantity)}
                  </p>
                </div>
              </div>

              {order.status === "completed" &&
                (item.reviews ? (
                  <p className="rounded-lg bg-ground px-3 py-2 text-[12px] text-muted-foreground">
                    この作品は評価済みです（総合 <span className="num">{item.reviews.rating}</span>）
                  </p>
                ) : (
                  <ReviewForm orderItemId={item.id} workTitle={item.works?.title ?? "この作品"} />
                ))}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <h2 className="text-[12.5px] font-semibold text-ink">お届け先</h2>
          {address ? (
            <p className="text-[12px] leading-5 text-muted-foreground">
              {address.recipient_name}
              <br />
              <span className="num">〒{address.postal_code}</span>
              <br />
              {address.prefecture}
              {address.city}
              {address.address_line}
              <br />
              <span className="num">{address.phone}</span>
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">登録がありません</p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <h2 className="text-[12.5px] font-semibold text-ink">お支払い</h2>
          <dl className="flex flex-col gap-1 text-[12px]">
            {/* 合計 = 作品代金 + 印刷代行費 + 送料（0015）。代行費は上乗せ請求なので「うち」ではない */}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">作品代金</dt>
              <dd className="num text-ink">{yen(order.subtotal_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">印刷代行費</dt>
              <dd className="num text-ink">{yen(order.print_cost_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">送料</dt>
              <dd className="num text-ink">{yen(order.shipping_fee_amount)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1">
              <dt className="font-semibold text-ink">合計</dt>
              <dd className="num text-sm font-bold text-ink">{yen(order.total_amount)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getMyOrder } from "@/features/orders/queries";
import { getServiceReview, listReviewableOrderItems } from "@/features/reviews/queries";
import { JOB_STATUS_LABEL } from "@/features/print-jobs/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderStatusStepper } from "@/components/order/order-status-stepper";
import { TrackingLink } from "@/components/order/tracking-link";
import { OrderActions } from "./order-actions";
import { ReviewSection } from "./review-section";

export const metadata = { title: "注文詳細" };

export default async function MyOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();
  const order = await getMyOrder(id, user.id);
  if (!order) {
    notFound();
  }
  const [reviewableItems, serviceReview] =
    order.status === "completed"
      ? await Promise.all([
          listReviewableOrderItems(id, user.id),
          getServiceReview(id, user.id),
        ])
      : [[], null];

  const jobByItem = new Map(order.print_jobs.map((j) => [j.order_item_id, j]));
  // 出荷予定日はジョブの期限のうち最も遅いもの
  const dueDates = order.print_jobs
    .map((j) => j.due_at)
    .filter((d): d is string => Boolean(d))
    .sort();
  const shipEstimate = dueDates.at(-1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/mypage/orders"
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← 購入履歴
        </Link>
        <h1 className="num text-lg font-bold text-ink">{order.order_number}</h1>
        <span className="ml-auto">
          <OrderActions orderId={order.id} status={order.status} />
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <OrderStatusStepper status={order.status} />
        {shipEstimate && order.status !== "completed" && (
          <p className="num text-[11.5px] text-muted-foreground">
            出荷予定日 {new Date(shipEstimate).toLocaleDateString("ja-JP")}
          </p>
        )}
        {order.shipments.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-line pt-2">
            {order.shipments.map((s) => (
              <TrackingLink
                key={s.id}
                carrier={s.carrier}
                trackingNumber={s.tracking_number}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-bold text-ink">注文内容</p>
        {order.order_items.map((item) => {
          const job = jobByItem.get(item.id);
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {item.products?.slug ? (
                  <Link
                    href={`/products/${item.products.slug}`}
                    className="truncate text-[13px] font-semibold text-ink hover:text-brand"
                  >
                    {item.product_title}
                  </Link>
                ) : (
                  <span className="truncate text-[13px] font-semibold text-ink">
                    {item.product_title}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {item.filament_name}
                  {item.nui_size_label ? ` / ${item.nui_size_label}` : ""} ×{" "}
                  {item.quantity}
                </span>
              </div>
              {job && (
                <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
                  {JOB_STATUS_LABEL[job.status]}
                </Badge>
              )}
              <span className="num text-[13px] font-semibold text-ink">
                ¥{item.line_total.toLocaleString()}
              </span>
            </div>
          );
        })}

        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-[12.5px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">小計</dt>
            <dd className="num text-ink">¥{order.subtotal.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">送料</dt>
            <dd className="num text-ink">¥{order.shipping_fee.toLocaleString()}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="font-semibold text-ink">合計</dt>
            <dd className="num text-lg font-bold text-brand">
              ¥{order.total.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 text-[12.5px]">
        <p className="text-sm font-bold text-ink">配送先</p>
        <p className="text-ink">{order.ship_recipient_name}</p>
        <p className="text-muted-foreground">
          〒{order.ship_postal_code} {order.ship_prefecture}
          {order.ship_city}
          {order.ship_address_line1}
          {order.ship_address_line2}
        </p>
        <p className="num text-muted-foreground">{order.ship_phone}</p>
        <Button
          render={<Link href="/mypage/messages" />}
          variant="outline"
          size="sm"
          className="mt-1 self-start"
        >
          <MessageSquare />
          運営・クリエイターに問い合わせ
        </Button>
      </div>

      <ReviewSection
        orderId={order.id}
        items={reviewableItems}
        serviceReview={serviceReview}
      />
    </div>
  );
}

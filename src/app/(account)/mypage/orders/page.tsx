import Link from "next/link";
import { ImageIcon, Package } from "lucide-react";

import { listMyOrders, ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "購入履歴" };

const TONE: Record<string, string> = {
  paid: "bg-brand-soft text-accent-foreground",
  printing_queued: "bg-brand-soft text-accent-foreground",
  printing: "bg-brand-soft text-accent-foreground",
  packaging: "bg-brand-soft text-accent-foreground",
  shipped: "bg-ok-bg text-ok",
  completed: "bg-ground text-muted-foreground",
  cancelled: "bg-ground text-muted-foreground",
  refunded: "bg-ground text-muted-foreground",
  payment_pending: "bg-warn-bg text-warn",
};

/** Figma ①購入フロー「購入履歴 46:2093」。 */
export default async function OrdersPage() {
  const orders = await listMyOrders();

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">購入履歴</h1>
        <span className="num text-[12px] text-muted-foreground">{orders.length}件</span>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Package className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">購入した作品はまだありません</p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/works">作品をさがす</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const items = order.order_items ?? [];
            const needsReview = order.status === "completed" && items.some((i) => !i.reviews);
            return (
              <Link
                key={order.id}
                href={`/mypage/orders/${order.id}`}
                className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 hover:bg-ground/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      TONE[order.status]
                    )}
                  >
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("ja-JP")}
                  </span>
                  {needsReview && (
                    <span className="rounded-full bg-star/15 px-2.5 py-0.5 text-[11px] font-semibold text-star">
                      評価をお願いします
                    </span>
                  )}
                  <span className="num ml-auto text-sm font-bold text-ink">
                    {yen(order.total_amount)}
                  </span>
                </div>

                {items.map((item) => {
                  const image = workImageUrl(
                    [...(item.works?.work_images ?? [])].sort(
                      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
                    )[0]?.storage_path
                  );
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-ground">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-4 text-line" aria-hidden />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[12.5px] font-semibold text-ink">
                          {item.works?.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.size_label_snapshot} / <span className="num">{item.quantity}</span>点
                        </span>
                      </span>
                    </div>
                  );
                })}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

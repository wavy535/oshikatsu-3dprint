import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { listMyOrders } from "@/features/orders/queries";
import { OrderStatusStepper } from "@/components/order/order-status-stepper";

export const metadata = { title: "購入履歴" };

export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ placed?: string }>;
}) {
  const { user } = await requireUser();
  const [orders, { placed }] = await Promise.all([listMyOrders(user.id), searchParams]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-ink">購入履歴</h1>

      {/* Figma 61:235 の注文完了バナー */}
      {placed && (
        <p className="flex items-center gap-2 rounded-xl border border-ok-line bg-ok-bg px-4 py-3 text-[12.5px] text-ok">
          <CheckCircle2 className="size-4" aria-hidden />
          ご注文ありがとうございます。印刷の準備に入りました。
        </p>
      )}

      {orders.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          まだ注文がありません
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/mypage/orders/${order.id}`}
                className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand/40"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="num text-[13px] font-semibold text-ink">
                    {order.order_number}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("ja-JP")}
                  </span>
                  <span className="flex-1" />
                  <span className="num text-[13px] font-bold text-ink">
                    ¥{order.total.toLocaleString()}
                  </span>
                </div>
                <OrderStatusStepper status={order.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

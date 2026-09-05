import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { listMyOrders } from "@/features/orders/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "支払い待ち",
  paid: "支払い完了",
  printing: "制作中",
  shipped: "発送済み",
  completed: "受取完了",
  cancelled: "キャンセル済み",
  refunded: "返金済み",
};

export default async function MyOrdersPage() {
  const { user } = await requireUser();
  const orders = await listMyOrders(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">注文履歴</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ注文がありません</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link key={order.id} href={`/mypage/orders/${order.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">¥{order.total.toLocaleString()}</span>
                    <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

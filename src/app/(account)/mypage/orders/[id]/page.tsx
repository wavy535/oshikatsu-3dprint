import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getMyOrder } from "@/features/orders/queries";
import { listReviewableOrderItems } from "@/features/reviews/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusStepper } from "@/components/order/order-status-stepper";
import { TrackingLink } from "@/components/order/tracking-link";
import { OrderActions } from "./order-actions";
import { ReviewSection } from "./review-section";

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
  const reviewableItems = order.status === "completed" ? await listReviewableOrderItems(id, user.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{order.order_number}</h1>
        <OrderActions orderId={order.id} status={order.status} />
      </div>

      <OrderStatusStepper status={order.status} />

      {order.shipments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>配送状況</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {order.shipments.map((s) => (
              <TrackingLink key={s.id} carrier={s.carrier} trackingNumber={s.tracking_number} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>注文内容</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{item.product_title}</p>
                <p className="text-muted-foreground">
                  {item.filament_name}
                  {item.nui_size_label ? ` / ${item.nui_size_label}` : ""} × {item.quantity}
                </p>
              </div>
              <span>¥{item.line_total.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-3 text-sm">
            <span>小計</span>
            <span>¥{order.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>送料</span>
            <span>¥{order.shipping_fee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>合計</span>
            <span>¥{order.total.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>配送先</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{order.ship_recipient_name}</p>
          <p>
            〒{order.ship_postal_code} {order.ship_prefecture}
            {order.ship_city}
            {order.ship_address_line1}
            {order.ship_address_line2}
          </p>
          <p>{order.ship_phone}</p>
        </CardContent>
      </Card>

      <ReviewSection items={reviewableItems} />
    </div>
  );
}

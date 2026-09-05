import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { adminGetOrder, adminGetProductionSheet } from "@/features/admin/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StlDownloadButton } from "@/components/admin/stl-download-button";
import { AdminNoteForm } from "./admin-note-form";
import { ItemStatusSelect } from "./item-status-select";
import { OrderActions } from "./order-actions";
import { ShipmentSection } from "./shipment-section";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "支払い待ち",
  paid: "支払い完了",
  printing: "制作中",
  shipped: "発送済み",
  completed: "受取完了",
  cancelled: "キャンセル済み",
  refunded: "返金済み",
};

type ProductionAsset = {
  assetId: string;
  partLabel: string | null;
  fileName: string;
  fileSize: number;
  qtyPerItem: number;
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const [order, sheet] = await Promise.all([adminGetOrder(id), adminGetProductionSheet(id)]);
  if (!order) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.order_number}</h1>
          <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
        </div>
        <OrderActions orderId={order.id} status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>制作指示書</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sheet.map((row) => (
            <div key={row.order_item_id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{row.product_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.creator_name} / {row.filament_name} / {row.nui_size_label ?? "-"} ×{" "}
                    {row.quantity}
                  </p>
                </div>
                <ItemStatusSelect orderItemId={row.order_item_id!} status={row.item_status!} />
              </div>
              {row.print_note && (
                <p className="text-xs text-muted-foreground">出力メモ: {row.print_note}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(row.assets as ProductionAsset[]).map((asset) => (
                  <StlDownloadButton
                    key={asset.assetId}
                    assetId={asset.assetId}
                    fileName={asset.partLabel ? `${asset.fileName}(${asset.partLabel})` : asset.fileName}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>発送</CardTitle>
        </CardHeader>
        <CardContent>
          <ShipmentSection orderId={order.id} status={order.status} shipments={order.shipments} />
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

      <Card>
        <CardHeader>
          <CardTitle>管理メモ</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminNoteForm orderId={order.id} note={order.admin_note} />
        </CardContent>
      </Card>
    </div>
  );
}

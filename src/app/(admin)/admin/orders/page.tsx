import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { adminListOrders } from "@/features/admin/queries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUSES = [
  "pending_payment",
  "paid",
  "printing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "支払い待ち",
  paid: "支払い完了",
  printing: "制作中",
  shipped: "発送済み",
  completed: "受取完了",
  cancelled: "キャンセル済み",
  refunded: "返金済み",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const validStatus = (STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof STATUSES)[number])
    : undefined;
  const orders = await adminListOrders({ status: validStatus });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">注文管理</h1>
      <div className="flex flex-wrap gap-2">
        {["", "paid", "printing", "shipped", "completed", "cancelled", "refunded"].map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/admin/orders?status=${s}` : "/admin/orders"}
            className="text-sm"
          >
            <Badge variant={status === s || (!status && !s) ? "default" : "outline"}>
              {s ? STATUS_LABEL[s] : "すべて"}
            </Badge>
          </Link>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>注文番号</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead>金額</TableHead>
            <TableHead>日時</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Link href={`/admin/orders/${order.id}`} className="underline underline-offset-2">
                  {order.order_number}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
              </TableCell>
              <TableCell>¥{order.total.toLocaleString()}</TableCell>
              <TableCell>{new Date(order.created_at).toLocaleString("ja-JP")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

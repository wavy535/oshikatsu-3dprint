import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import {
  listCreatorCustomOrders,
  CUSTOM_ORDER_STATUS_LABEL,
} from "@/features/custom-orders/queries";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "オーダーメイド相談" };

export default async function StudioCustomOrdersPage() {
  const { user } = await requireCreator();
  const orders = await listCreatorCustomOrders(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink">オーダーメイド相談</h1>
        <p className="text-[11.5px] text-muted-foreground">
          届いた相談に見積りを返します。承認されると決済に進みます。
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          相談はまだありません
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/studio/custom-orders/${o.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand/40"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-ink">
                    {o.products?.title}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {o.buyer?.display_name} ・ {o.request_note}
                  </span>
                </div>
                {o.quote_price != null && (
                  <span className="num text-[12px] font-semibold text-ink">
                    ¥{o.quote_price.toLocaleString()}
                  </span>
                )}
                <Badge variant={o.status === "requested" ? "destructive" : "outline"}>
                  {CUSTOM_ORDER_STATUS_LABEL[o.status] ?? o.status}
                </Badge>
                <span className="num text-[11px] text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("ja-JP")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

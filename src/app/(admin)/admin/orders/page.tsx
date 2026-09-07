import { Suspense } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";

import { getOrderSummary, listOrders, type OrderSearchParams } from "@/lib/ops/queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { ORDER_STATUS_FILTERS, shortDateTime, yen } from "@/lib/ops/labels";
import { ListFilters } from "@/components/ops/list-filters";
import { Pill } from "@/components/ops/status-badge";
import { StatCard, TD, TH } from "@/components/ops/stat-card";
import type { OrderStatus } from "@/types/db";
import type { Tone } from "@/lib/ops/labels";

export const metadata = { title: "注文一覧" };

const ORDER_TONE: Record<OrderStatus, Tone> = {
  payment_pending: "neutral",
  paid: "info",
  printing_queued: "neutral",
  printing: "info",
  packaging: "warn",
  shipped: "ok",
  completed: "ok",
  cancelled: "danger",
  refunded: "danger",
};

/**
 * 注文一覧。注文のステータスは印刷ジョブと発送記録から導出されたものを出すだけ
 * （設計判断9）。運営がここから進めるのはジョブ（印刷キュー）と発送登録。
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrderSearchParams>;
}) {
  const sp = await searchParams;
  const [orders, summary] = await Promise.all([listOrders(sp), getOrderSummary()]);
  const now = new Date().getTime();

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="進行中" tone="info" value={summary.open} note="決済完了〜発送待ち" />
        <StatCard label="発送待ち" tone="warn" value={summary.packaging} note="全ジョブが検品OK" />
        <StatCard
          label="期限超過"
          tone="danger"
          value={summary.overdue}
          note={summary.overdue > 0 ? "出荷期限を過ぎた進行中の注文" : "なし"}
        />
        <StatCard label="本日の受注" value={summary.today} />
      </div>

      <Suspense fallback={null}>
        <ListFilters
          basePath="/admin/orders"
          selects={[
            {
              name: "status",
              defaultValue: "open",
              options: ORDER_STATUS_FILTERS.map((f) => ({
                value: f.value,
                label: `ステータス：${f.label}`,
              })),
            },
          ]}
          searchPlaceholder="注文番号・購入者・作品名・ジョブ番号で検索"
        />
      </Suspense>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[980px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-ground text-[10.5px] text-muted-foreground">
              <th className={TH}>注文</th>
              <th className={TH}>受注日時</th>
              <th className={TH}>購入者</th>
              <th className={TH}>中身</th>
              <th className={`${TH} text-right`}>支払額</th>
              <th className={TH}>ジョブ</th>
              <th className={TH}>出荷期限</th>
              <th className={TH}>ステータス</th>
              <th className={TH}>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                  条件に合う注文はありません。
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const [first, ...rest] = o.order_items;
              const jobs = o.print_jobs;
              const passed = jobs.filter((j) => j.status === "qc_passed").length;
              const overdue =
                o.ship_due_at &&
                new Date(o.ship_due_at).getTime() < now &&
                ["paid", "printing_queued", "printing", "packaging"].includes(o.status);
              return (
                <tr key={o.id} className={`border-t border-line ${overdue ? "bg-danger-bg/50" : ""}`}>
                  <td className={`${TD} num font-semibold text-brand`}>
                    <Link href={`/admin/orders/${o.id}`} className="hover:underline">
                      #{o.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={`${TD} num text-ink`}>{shortDateTime(o.created_at)}</td>
                  <td className={`${TD} text-ink`}>
                    <span className="flex items-center gap-1.5">
                      {o.profiles?.display_name ?? "—"}
                      {o.gift_wrapping && <Gift className="size-3 text-warn" aria-label="ラッピング希望" />}
                    </span>
                  </td>
                  <td className={`${TD} text-ink`}>
                    {first ? (
                      <>
                        <span className="font-semibold">{first.works?.title ?? "（削除された作品）"}</span>
                        <span className="num text-muted-foreground">
                          {" "}
                          {first.size_label_snapshot}
                          {first.quantity > 1 ? ` ×${first.quantity}` : ""}
                        </span>
                        {rest.length > 0 && (
                          <span className="text-muted-foreground"> ほか{rest.length}件</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">明細なし</span>
                    )}
                  </td>
                  <td className={`${TD} num text-right text-ink`}>{yen(o.total_amount)}</td>
                  <td className={`${TD} num text-ink`}>
                    {jobs.length === 0 ? (
                      <span className="text-muted-foreground">未生成</span>
                    ) : (
                      <>
                        {passed}/{jobs.length} 検品OK
                      </>
                    )}
                  </td>
                  <td className={`${TD} num ${overdue ? "font-semibold text-danger" : "text-ink"}`}>
                    {shortDateTime(o.ship_due_at)}
                  </td>
                  <td className={TD}>
                    <Pill tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Pill>
                  </td>
                  <td className={TD}>
                    {o.status === "packaging" && jobs[0] ? (
                      <Link
                        href={`/admin/print-queue/${jobs[0].id}/qc`}
                        className="inline-flex items-center rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                      >
                        発送登録
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="inline-flex items-center rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-ground"
                      >
                        詳細
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

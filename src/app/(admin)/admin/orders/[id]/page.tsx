import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Gift } from "lucide-react";

import { getOrderForAdmin } from "@/lib/ops/queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { CARRIER_LABEL, shortDateTime, yen } from "@/lib/ops/labels";
import { JobStatusBadge, Pill } from "@/components/ops/status-badge";
import { Card, Row, TD, TH } from "@/components/ops/stat-card";

export const metadata = { title: "注文詳細（運営）" };

/**
 * 運営向けの注文詳細。お金の内訳はここが一番くわしい:
 *   支払い = 作品代金 + 印刷代行費 + 送料
 *   手数料 = 作品代金 × 料率（注文時のスナップショット）
 *   受取   = 作品代金 − 手数料
 */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderForAdmin(id);
  if (!order) notFound();

  const address = order.addresses;
  const shipment = order.shipments?.[0] ?? null;
  const payout = order.order_items.reduce((n, i) => n + i.creator_payout_amount, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-ground"
        >
          <ChevronLeft className="size-3" aria-hidden />
          注文一覧へ
        </Link>
        <p className="num text-[17px] font-bold text-ink">#{order.id.slice(0, 8)}</p>
        <Pill tone={order.status === "shipped" || order.status === "completed" ? "ok" : "info"}>
          {ORDER_STATUS_LABEL[order.status]}
        </Pill>
        <span className="num text-[11px] text-muted-foreground">
          受注 {shortDateTime(order.created_at)}
        </span>
        {order.gift_wrapping && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-warn-bg px-2 py-1 text-[10.5px] font-semibold text-warn">
            <Gift className="size-3" aria-hidden />
            ラッピング希望
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Card title="明細">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[11px]">
                <thead>
                  <tr className="text-[10.5px] text-muted-foreground">
                    <th className={`${TH} border-b border-line`}>作品</th>
                    <th className={`${TH} border-b border-line`}>クリエイター</th>
                    <th className={`${TH} border-b border-line text-right`}>作品代金</th>
                    <th className={`${TH} border-b border-line text-right`}>印刷代行費</th>
                    <th className={`${TH} border-b border-line text-right`}>手数料</th>
                    <th className={`${TH} border-b border-line text-right`}>受取額</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-b-0">
                      <td className={`${TD} text-ink`}>
                        <span className="font-semibold">{i.works?.title ?? "（削除された作品）"}</span>
                        <span className="num text-muted-foreground">
                          {" "}
                          {i.size_label_snapshot}
                          {i.quantity > 1 ? ` ×${i.quantity}` : ""}
                        </span>
                      </td>
                      <td className={`${TD} text-ink`}>{i.profiles?.display_name ?? "—"}</td>
                      <td className={`${TD} num text-right text-ink`}>{yen(i.unit_price * i.quantity)}</td>
                      <td className={`${TD} num text-right text-muted-foreground`}>{yen(i.print_cost_amount)}</td>
                      <td className={`${TD} num text-right text-muted-foreground`}>{yen(i.platform_fee_amount)}</td>
                      <td className={`${TD} num text-right font-semibold text-ink`}>{yen(i.creator_payout_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="印刷ジョブ">
            {order.print_jobs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                ジョブはまだ生成されていません（決済完了時に create_print_jobs_for_order() が作ります）。
              </p>
            ) : (
              order.print_jobs.map((j) => (
                <div key={j.id} className="flex items-center gap-3 text-[11px]">
                  <Link
                    href={`/admin/print-queue/${j.id}`}
                    className="num font-semibold text-brand hover:underline"
                  >
                    {j.job_no}
                  </Link>
                  <JobStatusBadge status={j.status} />
                  <span className="num text-muted-foreground">期限 {shortDateTime(j.due_at)}</span>
                  {j.actual_filament_grams !== null && (
                    <span className="num text-muted-foreground">
                      実績 {j.actual_filament_grams}g / {j.actual_print_hours}h
                    </span>
                  )}
                  <span className="flex-1" />
                  {(j.status === "printed" || j.status === "qc_failed") && (
                    <Link
                      href={`/admin/print-queue/${j.id}/qc`}
                      className="rounded-md bg-brand px-2.5 py-1 text-[10.5px] font-semibold text-white hover:opacity-90"
                    >
                      検品
                    </Link>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="お金の内訳">
            <Row label="作品代金" value={<span className="num">{yen(order.subtotal_amount)}</span>} />
            <Row label="印刷代行費" value={<span className="num">{yen(order.print_cost_amount)}</span>} />
            <Row label="送料（購入者負担）" value={<span className="num">{yen(order.shipping_fee_amount)}</span>} />
            <div className="my-1 border-t border-line" />
            <Row label="購入者の支払い" value={<span className="num text-[12.5px]">{yen(order.total_amount)}</span>} />
            <div className="my-1 border-t border-line" />
            <Row label="運営手数料" value={<span className="num">{yen(order.platform_fee_amount)}</span>} />
            <Row label="クリエイター受取" value={<span className="num">{yen(payout)}</span>} />
            <p className="pt-1 text-[10px] text-muted-foreground">
              手数料は「支払い − 印刷代行費 − 送料」（＝作品代金）にかかります。金額は注文時の値です。
            </p>
          </Card>

          <Card title="購入者・お届け先">
            <Row label="購入者" value={order.profiles?.display_name ?? "—"} />
            <Row label="宛名" value={address?.recipient_name ?? "—"} />
            <Row
              label="住所"
              value={
                address
                  ? `〒${address.postal_code} ${address.prefecture}${address.city}${address.address_line}`
                  : "—"
              }
            />
            <Row label="電話" value={<span className="num">{address?.phone ?? "—"}</span>} />
            <Row label="出荷期限" value={<span className="num">{shortDateTime(order.ship_due_at)}</span>} />
          </Card>

          <Card title="発送">
            {shipment ? (
              <>
                <Row label="配送業者" value={CARRIER_LABEL[shipment.carrier]} />
                <Row label="配送方法" value={shipment.service_name ?? "—"} />
                <Row label="追跡番号" value={<span className="num">{shipment.tracking_number ?? "—"}</span>} />
                <Row
                  label="重量 / 三辺"
                  value={<span className="num">{shipment.weight_grams ?? "—"}g / {shipment.size_sum_cm ?? "—"}cm</span>}
                />
                <Row label="送料（実費）" value={<span className="num">{yen(shipment.shipping_fee_jpy)}</span>} />
                <Row label="発送日時" value={<span className="num">{shortDateTime(shipment.shipped_at)}</span>} />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                まだ発送していません。
                {order.status === "packaging" && order.print_jobs[0] && (
                  <>
                    {" "}
                    <Link
                      href={`/admin/print-queue/${order.print_jobs[0].id}/qc`}
                      className="font-semibold text-brand hover:underline"
                    >
                      発送登録へ
                    </Link>
                  </>
                )}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

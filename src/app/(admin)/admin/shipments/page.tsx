import { Suspense } from "react";
import Link from "next/link";

import { getShipmentSummary, listShipments, type ShipmentSearchParams } from "@/lib/ops/shipping-queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { CARRIER_LABEL, shortDateTime, yen } from "@/lib/ops/labels";
import { ListFilters } from "@/components/ops/list-filters";
import { Pill } from "@/components/ops/status-badge";
import { StatCard, TD, TH } from "@/components/ops/stat-card";
import type { ShippingCarrier } from "@/types/db";

export const metadata = { title: "出荷済み" };

/**
 * 出荷済みの一覧。発送記録（shipments）を新しい順に出す。
 * 送料は「購入者からもらった額」と「運営が払った実費」を並べて見せる。
 */
export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<ShipmentSearchParams>;
}) {
  const sp = await searchParams;
  const [shipments, summary] = await Promise.all([listShipments(sp), getShipmentSummary()]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="本日の発送" tone="ok" value={summary.today} note={`直近7日 ${summary.week}件`} />
        <StatCard label="累計" value={summary.total} note="発送記録の件数" />
        <StatCard
          label="平均リードタイム"
          tone="info"
          value={summary.avgLeadDays === null ? "—" : `${summary.avgLeadDays.toFixed(1)}日`}
          note="受注から発送まで"
        />
        <StatCard
          label="送料の差額"
          tone={summary.shippingBalance < 0 ? "danger" : "neutral"}
          value={yen(summary.shippingBalance)}
          note="購入者負担 − 実費（累計）"
        />
      </div>

      <Suspense fallback={null}>
        <ListFilters
          basePath="/admin/shipments"
          selects={[
            {
              name: "carrier",
              options: [
                { value: "", label: "配送業者：すべて" },
                ...(Object.keys(CARRIER_LABEL) as ShippingCarrier[]).map((c) => ({
                  value: c,
                  label: `配送業者：${CARRIER_LABEL[c]}`,
                })),
              ],
            },
          ]}
          searchPlaceholder="追跡番号・購入者・作品名で検索"
        />
      </Suspense>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[980px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-ground text-[10.5px] text-muted-foreground">
              <th className={TH}>発送日時</th>
              <th className={TH}>注文</th>
              <th className={TH}>購入者 / お届け先</th>
              <th className={TH}>中身</th>
              <th className={TH}>配送</th>
              <th className={TH}>追跡番号</th>
              <th className={`${TH} text-right`}>重量 / 三辺</th>
              <th className={`${TH} text-right`}>送料（負担 / 実費）</th>
              <th className={TH}>担当</th>
              <th className={TH}>注文の状態</th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                  発送記録はまだありません。
                </td>
              </tr>
            )}
            {shipments.map((s) => {
              const o = s.orders;
              const items = o?.order_items ?? [];
              const [first, ...rest] = items;
              return (
                <tr key={s.id} className="border-t border-line">
                  <td className={`${TD} num text-ink`}>{shortDateTime(s.shipped_at)}</td>
                  <td className={`${TD} num font-semibold text-brand`}>
                    {o ? (
                      <Link href={`/admin/orders/${o.id}`} className="hover:underline">
                        #{o.id.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${TD} text-ink`}>
                    <span className="block font-semibold">{o?.profiles?.display_name ?? "—"}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {o?.addresses ? `${o.addresses.prefecture} ${o.addresses.city}` : "—"}
                    </span>
                  </td>
                  <td className={`${TD} text-ink`}>
                    {first ? (
                      <>
                        {first.works?.title ?? "（削除された作品）"}
                        <span className="num text-muted-foreground">
                          {" "}
                          {first.size_label_snapshot}
                          {first.quantity > 1 ? ` ×${first.quantity}` : ""}
                        </span>
                        {rest.length > 0 && <span className="text-muted-foreground"> ほか{rest.length}件</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${TD} text-ink`}>
                    <span className="block">{CARRIER_LABEL[s.carrier]}</span>
                    <span className="block text-[10px] text-muted-foreground">{s.service_name ?? "—"}</span>
                  </td>
                  <td className={`${TD} num text-ink`}>{s.tracking_number ?? "—"}</td>
                  <td className={`${TD} num text-right text-ink`}>
                    {s.weight_grams ?? "—"}g / {s.size_sum_cm ?? "—"}cm
                  </td>
                  <td className={`${TD} num text-right text-ink`}>
                    {yen(o?.shipping_fee_amount)} / {yen(s.shipping_fee_jpy)}
                  </td>
                  <td className={`${TD} text-ink`}>{s.profiles?.display_name ?? "—"}</td>
                  <td className={TD}>
                    {o && (
                      <Pill tone={o.status === "completed" ? "ok" : o.status === "shipped" ? "info" : "neutral"}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </Pill>
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

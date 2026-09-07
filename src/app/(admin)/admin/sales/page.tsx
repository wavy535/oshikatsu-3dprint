import Link from "next/link";

import { getSales } from "@/lib/ops/queries";
import { monthKey, monthLabel, shortDateTime, yen } from "@/lib/ops/labels";
import { MonthSelect } from "@/components/ops/month-select";
import { Card, Row, StatCard, TD, TH } from "@/components/ops/stat-card";

export const metadata = { title: "売上・手数料" };

/**
 * 売上・手数料。運営の決め（2026-09-08）:
 *   手数料 = (購入者の支払い − 印刷代行費 − 送料) × 20%
 * 印刷代行費と送料は運営の実費回収ぶんなので手数料の対象にしない。
 * 残り（＝作品代金）の 20% が手数料、80% がクリエイターの受取。
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return monthKey(d);
  });
  const month = sp.month === "all" || (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month : months[0];

  const sales = await getSales(month);
  const t = sales.totals;
  const ratePct = Math.round(sales.feeRate * 100);
  const maxGoods = Math.max(...sales.trend.map((m) => m.goods), 1);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-bold text-ink">
          売上・手数料 <span className="text-[12px] font-normal text-muted-foreground">{month === "all" ? "全期間" : monthLabel(month)}</span>
        </h1>
        <span className="flex-1" />
        <MonthSelect value={month} months={months} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="購入者の支払い" tone="info" value={yen(t.gross)} note={`${t.orders}件の注文`} />
        <StatCard label="作品代金" value={yen(t.goods)} note="支払い − 印刷代行費 − 送料" />
        <StatCard label={`運営手数料（${ratePct}%）`} tone="ok" value={yen(t.fee)} note="作品代金にかかる" />
        <StatCard label="クリエイター受取" value={yen(t.payout)} note="作品代金 − 手数料" />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Card title="クリエイター別">
            {sales.creators.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">この期間の売上はありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10.5px] text-muted-foreground">
                      <th className={`${TH} border-b border-line`}>クリエイター</th>
                      <th className={`${TH} border-b border-line text-right`}>注文</th>
                      <th className={`${TH} border-b border-line text-right`}>作品代金</th>
                      <th className={`${TH} border-b border-line text-right`}>手数料</th>
                      <th className={`${TH} border-b border-line text-right`}>受取額</th>
                      <th className={`${TH} border-b border-line text-right`}>払込（申請中 / 済）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.creators.map((c) => (
                      <tr key={c.creatorId} className="border-b border-line last:border-b-0">
                        <td className={`${TD} font-semibold text-ink`}>{c.name}</td>
                        <td className={`${TD} num text-right text-ink`}>{c.orderCount}</td>
                        <td className={`${TD} num text-right text-ink`}>{yen(c.goods)}</td>
                        <td className={`${TD} num text-right text-muted-foreground`}>{yen(c.fee)}</td>
                        <td className={`${TD} num text-right font-semibold text-ink`}>{yen(c.payout)}</td>
                        <td className={`${TD} num text-right text-muted-foreground`}>
                          {yen(c.requested)} / {yen(c.paidOut)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="注文ごと">
            {sales.orders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">この期間の注文はありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10.5px] text-muted-foreground">
                      <th className={`${TH} border-b border-line`}>注文</th>
                      <th className={`${TH} border-b border-line`}>受注日時</th>
                      <th className={`${TH} border-b border-line text-right`}>支払い</th>
                      <th className={`${TH} border-b border-line text-right`}>印刷代行費</th>
                      <th className={`${TH} border-b border-line text-right`}>送料</th>
                      <th className={`${TH} border-b border-line text-right`}>作品代金</th>
                      <th className={`${TH} border-b border-line text-right`}>手数料</th>
                      <th className={`${TH} border-b border-line text-right`}>受取</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.orders.map((o) => (
                      <tr key={o.id} className="border-b border-line last:border-b-0">
                        <td className={`${TD} num font-semibold text-brand`}>
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline">
                            #{o.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className={`${TD} num text-ink`}>{shortDateTime(o.created_at)}</td>
                        <td className={`${TD} num text-right text-ink`}>{yen(o.total_amount)}</td>
                        <td className={`${TD} num text-right text-muted-foreground`}>−{yen(o.print_cost_amount)}</td>
                        <td className={`${TD} num text-right text-muted-foreground`}>−{yen(o.shipping_fee_amount)}</td>
                        <td className={`${TD} num text-right text-ink`}>{yen(o.subtotal_amount)}</td>
                        <td className={`${TD} num text-right text-ok`}>{yen(o.platform_fee_amount)}</td>
                        <td className={`${TD} num text-right text-ink`}>{yen(o.subtotal_amount - o.platform_fee_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="手数料の計算">
            <Row label="購入者の支払い" value={<span className="num">{yen(t.gross)}</span>} />
            <Row label="− 印刷代行費（運営の実費回収）" value={<span className="num">{yen(t.printCost)}</span>} />
            <Row label="− 送料（運営の実費回収）" value={<span className="num">{yen(t.shipping)}</span>} />
            <div className="my-1 border-t border-line" />
            <Row label="＝ 作品代金" value={<span className="num">{yen(t.goods)}</span>} />
            <Row label={`× ${ratePct}% ＝ 運営手数料`} value={<span className="num font-bold">{yen(t.fee)}</span>} />
            <Row label={`残り ${100 - ratePct}% ＝ クリエイター受取`} value={<span className="num">{yen(t.payout)}</span>} />
            <p className="pt-1 text-[10px] text-muted-foreground">
              料率は print_pricing_rules.platform_fee_rate。金額は注文時の値を足したもので、
              料率を変えても過去の注文は変わりません。
            </p>
          </Card>

          <Card title="月別（直近6か月）">
            {/* 棒の高さは px で出す（%高さは親の高さが決まっていないと潰れる） */}
            <div className="flex items-end gap-2">
              {sales.trend.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${monthLabel(m.key)} 作品代金 ${yen(m.goods)} / 手数料 ${yen(m.fee)}`}
                >
                  <div className="flex h-[72px] w-full flex-col justify-end">
                    <div
                      className={`w-full rounded-t ${m.key === month ? "bg-brand" : "bg-brand-soft"}`}
                      style={{ height: `${m.goods > 0 ? Math.max(Math.round((m.goods / maxGoods) * 72), 3) : 0}px` }}
                    />
                  </div>
                  <span className="num text-[9.5px] text-muted-foreground">{Number(m.key.split("-")[1])}月</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-0.5 pt-1">
              {sales.trend.slice().reverse().map((m) => (
                <div key={m.key} className="flex items-baseline gap-2 text-[10.5px]">
                  <span className="w-[62px] text-muted-foreground">{monthLabel(m.key)}</span>
                  <span className="num text-ink">{yen(m.goods)}</span>
                  <span className="num flex-1 text-right text-ok">{yen(m.fee)}</span>
                  <span className="num w-8 text-right text-muted-foreground">{m.count}件</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

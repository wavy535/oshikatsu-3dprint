import Link from "next/link";

import { getSales } from "@/lib/ops/queries";
import { monthKey, monthLabel, shortDateTime, yen } from "@/lib/ops/labels";
import { MonthSelect } from "@/components/ops/month-select";
import { Pill } from "@/components/ops/status-badge";
import { Card, Row, StatCard, TD, TH } from "@/components/ops/stat-card";

export const metadata = { title: "売上・手数料" };

/**
 * 売上・手数料。運営の決め（2026-09-08）:
 *   手数料 = (購入者の支払い − 印刷の実費 − 送料の実費) × 20%
 * 実費は発送後に確定する。それまでは請求した代行費・購入者負担の送料で見込みを出す。
 * 式そのものは DB の order_settlements ビューが持ち、ここは足して見せるだけ。
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const month = sp.month === "all" || (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month : months[0];

  const sales = await getSales(month);
  const t = sales.totals;
  const ratePct = Math.round(sales.feeRate * 100);
  const maxPool = Math.max(...sales.trend.map((m) => m.pool), 1);
  const estimateCount = t.orders - t.finalCount;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-bold text-ink">
          売上・手数料{" "}
          <span className="text-[12px] font-normal text-muted-foreground">
            {month === "all" ? "全期間" : monthLabel(month)}
          </span>
        </h1>
        {estimateCount > 0 && (
          <Pill tone="warn">見込み {estimateCount}件を含む</Pill>
        )}
        <span className="flex-1" />
        <MonthSelect value={month} months={months} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="購入者の支払い" tone="info" value={yen(t.gross)} note={`${t.orders}件（確定 ${t.finalCount}・見込み ${estimateCount}）`} />
        <StatCard label="差引" value={yen(t.pool)} note="支払い − 印刷実費 − 送料実費" />
        <StatCard label={`運営手数料（${ratePct}%）`} tone="ok" value={yen(t.fee)} note="差引にかかる" />
        <StatCard label="クリエイター受取" value={yen(t.payout)} note="差引 − 手数料" />
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
                <p className="pt-2 text-[10px] text-muted-foreground">
                  複数のクリエイターが入った注文は、作品代金の割合で手数料と受取を配っています。
                </p>
              </div>
            )}
          </Card>

          <Card title="注文ごと">
            {sales.settlements.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">この期間の注文はありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10.5px] text-muted-foreground">
                      <th className={`${TH} border-b border-line`}>注文</th>
                      <th className={`${TH} border-b border-line`}>受注</th>
                      <th className={`${TH} border-b border-line text-right`}>支払い</th>
                      <th className={`${TH} border-b border-line text-right`}>印刷（実費）</th>
                      <th className={`${TH} border-b border-line text-right`}>送料（実費）</th>
                      <th className={`${TH} border-b border-line text-right`}>差引</th>
                      <th className={`${TH} border-b border-line text-right`}>手数料</th>
                      <th className={`${TH} border-b border-line text-right`}>受取</th>
                      <th className={`${TH} border-b border-line`}>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.settlements.map((s) => (
                      <tr key={s.orderId} className={`border-b border-line last:border-b-0 ${s.payout < 0 ? "bg-danger-bg/50" : ""}`}>
                        <td className={`${TD} num font-semibold text-brand`}>
                          <Link href={`/admin/orders/${s.orderId}`} className="hover:underline">
                            #{s.orderId.slice(0, 8)}
                          </Link>
                        </td>
                        <td className={`${TD} num text-ink`}>{shortDateTime(s.orderedAt)}</td>
                        <td className={`${TD} num text-right text-ink`}>{yen(s.gross)}</td>
                        <td className={`${TD} num text-right ${s.printActual === null ? "text-muted-foreground" : "text-ink"}`}>
                          −{yen(s.printUsed)}
                          {s.printActual === null && <span className="block text-[9.5px]">請求額で仮</span>}
                        </td>
                        <td className={`${TD} num text-right ${s.shippingActual === null ? "text-muted-foreground" : "text-ink"}`}>
                          −{yen(s.shippingUsed)}
                          {s.shippingActual === null && <span className="block text-[9.5px]">購入者負担で仮</span>}
                        </td>
                        <td className={`${TD} num text-right text-ink`}>{yen(s.pool)}</td>
                        <td className={`${TD} num text-right text-ok`}>{yen(s.fee)}</td>
                        <td className={`${TD} num text-right ${s.payout < 0 ? "font-semibold text-danger" : "text-ink"}`}>{yen(s.payout)}</td>
                        <td className={TD}>
                          <Pill tone={s.isFinal ? "ok" : "warn"}>{s.isFinal ? "確定" : "見込み"}</Pill>
                        </td>
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
            <Row label="− 印刷の実費" value={<span className="num">{yen(t.printUsed)}</span>} />
            <Row label="− 送料の実費" value={<span className="num">{yen(t.shippingUsed)}</span>} />
            <div className="my-1 border-t border-line" />
            <Row label="＝ 差引" value={<span className="num">{yen(t.pool)}</span>} />
            <Row label={`× ${ratePct}% ＝ 運営手数料`} value={<span className="num font-bold">{yen(t.fee)}</span>} />
            <Row label={`残り ＝ クリエイター受取`} value={<span className="num">{yen(t.payout)}</span>} />
            <div className="my-1 border-t border-line" />
            <Row label="（参考）請求した印刷代行費" value={<span className="num text-muted-foreground">{yen(t.printFee)}</span>} />
            <Row label="（参考）購入者負担の送料" value={<span className="num text-muted-foreground">{yen(t.shippingCharged)}</span>} />
            <p className="pt-1 text-[10px] text-muted-foreground">
              実費は発送が終わると確定します（印刷：実使用グラム×フィラメント単価＋実印刷時間×機械費＋検品梱包、
              送料：発送登録で入れた実費）。それまでは請求額で仮に計算しています。
              料率は注文時の値を使うので、あとで料率を変えても過去の注文は動きません。
            </p>
          </Card>

          <Card title="月別（直近6か月）">
            {/* 棒の高さは px で出す（%高さは親の高さが決まっていないと潰れる） */}
            <div className="flex items-end gap-2">
              {sales.trend.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${monthLabel(m.key)} 差引 ${yen(m.pool)} / 手数料 ${yen(m.fee)}`}
                >
                  <div className="flex h-[72px] w-full flex-col justify-end">
                    <div
                      className={`w-full rounded-t ${m.key === month ? "bg-brand" : "bg-brand-soft"}`}
                      style={{ height: `${m.pool > 0 ? Math.max(Math.round((m.pool / maxPool) * 72), 3) : 0}px` }}
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
                  <span className="num text-ink">{yen(m.pool)}</span>
                  <span className="num flex-1 text-right text-ok">{yen(m.fee)}</span>
                  <span className="num w-8 text-right text-muted-foreground">{m.count}件</span>
                </div>
              ))}
              <p className="pt-1 text-[10px] text-muted-foreground">差引と手数料。見込みの注文も含みます。</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

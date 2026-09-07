import Link from "next/link";
import { ImageIcon, TrendingDown, TrendingUp } from "lucide-react";

import { getCreatorDashboard } from "@/lib/sales/queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { monthKey, monthLabel, shortDateTime } from "@/lib/ops/labels";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { RequestPayoutButton } from "@/components/sales/payout-forms";
import { MonthSelect } from "@/components/sales/month-select";

export const metadata = { title: "売上ダッシュボード" };

/**
 * Figma ②出品フロー「クリエイター売上ダッシュボード 47:488」。
 * 金額は明細ごとの精算（見込み／確定）を足したもの。振込予定は受取残高から。
 */
export default async function StudioDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : months[0];

  const d = await getCreatorDashboard(month);
  const b = d.balance;
  const maxGoods = Math.max(...d.trend.map((t) => t.goods), 1);

  const cards = [
    {
      label: "今月の売上（作品代金）",
      value: yen(d.goods),
      sub:
        d.goodsChangePct === null ? "前月の実績なし" : (
          <span className={`flex items-center gap-1 ${d.goodsChangePct >= 0 ? "text-ok" : "text-danger"}`}>
            {d.goodsChangePct >= 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
            {d.goodsChangePct >= 0 ? "+" : ""}{d.goodsChangePct}%
          </span>
        ),
    },
    { label: "販売点数", value: `${d.units}点`, sub: `${d.unitsChange >= 0 ? "+" : ""}${d.unitsChange}点（前月比）` },
    { label: "今月の受取（見込み含む）", value: yen(d.monthPayout), sub: "実費で確定すると変わります" },
    { label: "フォロワー", value: `${d.followers}`, sub: "公開プロフィールから" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-ink">売上ダッシュボード</h1>
        <span className="flex-1" />
        <MonthSelect value={month} months={months} basePath="/studio" />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="flex flex-col gap-1 rounded-xl border border-line bg-white p-3.5">
                <p className="text-[10.5px] text-muted-foreground">{c.label}</p>
                <p className="num text-[22px] leading-8 font-bold text-ink">{c.value}</p>
                <p className="text-[10px] text-muted-foreground">{c.sub}</p>
              </div>
            ))}
          </div>

          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-ink">売上推移</h2>
              <span className="text-[10.5px] text-muted-foreground">直近8か月・作品代金</span>
            </div>
            <div className="flex items-end gap-3">
              {d.trend.map((t) => (
                <div key={t.key} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(t.key)} ${yen(t.goods)}`}>
                  <span className="num text-[9px] text-muted-foreground">{t.goods > 0 ? yen(t.goods) : ""}</span>
                  <div className="flex h-[110px] w-full flex-col justify-end">
                    <div
                      className={`w-full rounded-t-md ${t.key === month ? "bg-brand" : "bg-brand-soft"}`}
                      style={{ height: `${t.goods > 0 ? Math.max(Math.round((t.goods / maxGoods) * 110), 4) : 0}px` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{Number(t.key.split("-")[1])}月</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col rounded-xl border border-line bg-white">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="text-[12.5px] font-bold text-ink">直近の販売</h2>
              <Link href="/studio/payouts" className="ml-auto text-[11px] text-brand hover:underline">
                受け取りの明細へ
              </Link>
            </div>
            {d.recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">まだ販売がありません。</p>
            ) : (
              d.recent.map((r) => {
                const image = workImageUrl(r.thumbnail_path);
                return (
                  <div key={r.item_id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="flex size-9 flex-none items-center justify-center overflow-hidden rounded-lg border border-line bg-ground">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageIcon className="size-4 text-line" aria-hidden />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[11.5px] font-medium text-ink">
                        {r.work_title ?? "（削除された作品）"}{" "}
                        <span className="num text-muted-foreground">{r.size_label_snapshot}{(r.quantity ?? 1) > 1 ? ` ×${r.quantity}` : ""}</span>
                      </span>
                      <span className="num text-[9.5px] text-muted-foreground">
                        #{r.order_id?.slice(0, 8)} ・ {shortDateTime(r.ordered_at)}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.status === "shipped" || r.status === "completed" ? "bg-ok-bg text-ok" : "bg-brand-soft text-brand"
                    }`}>
                      {r.status ? ORDER_STATUS_LABEL[r.status] : "—"}
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="num text-[12.5px] font-bold text-ink">{yen(r.payout_amount)}</span>
                      <span className="text-[9px] text-muted-foreground">{r.is_final ? "確定" : "見込み"}</span>
                    </span>
                  </div>
                );
              })
            )}
          </section>
        </div>

        <aside className="flex w-full flex-col gap-3 xl:w-[300px] xl:flex-none">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[13px] font-bold text-ink">受け取り</h2>
            <p className="num text-[26px] leading-10 font-bold text-brand">{yen(b?.available_amount ?? 0)}</p>
            <p className="-mt-1 text-[10.5px] text-muted-foreground">いま申請できる金額</p>
            <dl className="flex flex-col gap-1 pt-1 text-[11px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">確定した受取</dt><dd className="num text-ink">{yen(b?.settled_payout ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">再印刷の負担</dt><dd className="num text-ink">− {yen(b?.reprint_charges ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">申請中・振込済み</dt><dd className="num text-ink">− {yen((b?.requested_amount ?? 0) + (b?.paid_amount ?? 0))}</dd></div>
              <div className="flex justify-between border-t border-line pt-1"><dt className="text-muted-foreground">発送待ち（見込み）</dt><dd className="num text-muted-foreground">{yen(b?.pending_payout ?? 0)}</dd></div>
            </dl>
            <RequestPayoutButton amount={b?.available_amount ?? 0} hasAccount={!!d.account} />
          </section>

          <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
            <div className="flex items-center">
              <h2 className="text-[12px] font-semibold text-ink">振込先口座</h2>
              <Link href="/studio/payouts" className="ml-auto text-[11px] text-brand hover:underline">
                {d.account ? "変更" : "登録"}
              </Link>
            </div>
            <p className="num text-[11px] text-muted-foreground">
              {d.account
                ? `${d.account.bank_name} ${d.account.branch_name} ${d.account.account_type} ****${d.account.account_number.slice(-4)}`
                : "未登録"}
            </p>
          </section>

          <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12px] font-semibold text-ink">受取の決まり</h2>
            <p className="text-[10.5px] leading-4 text-muted-foreground">
              受取 ＝ 購入者の支払い − 印刷の実費 − 送料の実費 − 運営手数料 20%。
              発送が終わると実費で確定します。それまでの数字は見込みです。
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

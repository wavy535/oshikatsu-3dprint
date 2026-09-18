import { Pagination } from "@/components/ui/pagination";
import { getPayoutContext } from "@/lib/sales/queries";
import { PAYOUT_STATUS_LABEL, shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/lib/format";
import { PayoutAccountForm, RequestPayoutButton } from "@/components/sales/payout-forms";

export const metadata = { title: "売上の受け取り" };

const STATUS_TONE: Record<string, string> = {
  requested: "bg-warn-bg text-warn",
  processing: "bg-brand-soft text-brand",
  paid: "bg-ok-bg text-ok",
  rejected: "bg-danger-bg text-danger",
};

/** 受取残高・振込先口座・申請の履歴・再印刷の負担。 */
export default async function StudioPayoutsPage({ searchParams }: { searchParams: Promise<{ page?: string; chargesPage?: string }> }) {
  const sp = await searchParams;
  const { balance: b, account, requests, charges, requestPaging, chargePaging } = await getPayoutContext(sp.page, sp.chargesPage);

  return (
    <>
      <h1 className="text-base font-bold text-ink">売上の受け取り</h1>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">申請の履歴</h2>
            {requests.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">まだ申請はありません。</p>
            ) : (
              <table className="w-full border-collapse text-[11.5px]">
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-b-0">
                      <td className="num py-2 text-muted-foreground">{shortDateTime(r.requested_at)}</td>
                      <td className="num py-2 text-right font-semibold text-ink">{yen(r.amount)}</td>
                      <td className="py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[r.status]}`}>
                          {PAYOUT_STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="num py-2 text-right text-muted-foreground">
                        {r.processed_at ? `処理 ${shortDateTime(r.processed_at)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pagination path="/studio/payouts" params={sp} {...requestPaging} label="払込申請のページ切り替え" />
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">再印刷の負担（受取から差し引き）</h2>
            {charges.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">差し引きはありません。</p>
            ) : (
              <table className="w-full border-collapse text-[11.5px]">
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-b-0">
                      <td className="num py-2 text-brand">{c.revision_no}</td>
                      <td className="py-2 text-ink">{c.works?.title ?? "—"}</td>
                      <td className="num py-2 text-muted-foreground">{shortDateTime(c.created_at)}</td>
                      <td className="num py-2 text-right font-semibold text-danger">− {yen(c.reprint_fee_jpy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[10px] text-muted-foreground">
              検品で「モデル側」と判定された再印刷の代行費です。判定に納得できないときは修正依頼の画面から運営に相談できます。
            </p>
            <Pagination path="/studio/payouts" params={sp} {...chargePaging} pageKey="chargesPage" label="再印刷費用のページ切り替え" />
          </section>
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[320px] lg:flex-none">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">受取可能額</h2>
            <p className="num text-[26px] leading-10 font-bold text-brand">{yen(b?.available_amount ?? 0)}</p>
            <dl className="flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">確定した受取</dt><dd className="num text-ink">{yen(b?.settled_payout ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">再印刷の負担</dt><dd className="num text-ink">− {yen(b?.reprint_charges ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">申請中</dt><dd className="num text-ink">− {yen(b?.requested_amount ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">振込済み</dt><dd className="num text-ink">− {yen(b?.paid_amount ?? 0)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1"><dt className="text-muted-foreground">発送待ち（見込み）</dt><dd className="num text-muted-foreground">{yen(b?.pending_payout ?? 0)}</dd></div>
            </dl>
            <RequestPayoutButton amount={b?.available_amount ?? 0} hasAccount={!!account} />
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">振込先口座</h2>
            <PayoutAccountForm account={account} />
          </section>
        </aside>
      </div>
    </>
  );
}

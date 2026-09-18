import { Pagination } from "@/components/ui/pagination";
import { listPayoutRequests } from "@/lib/ops/sales-queries";
import { yen } from "@/lib/format";
import { PAYOUT_STATUS_LABEL, shortDateTime } from "@/lib/ops/labels";
import { PayoutActions } from "@/components/ops/payout-actions";
import { Pill } from "@/components/ops/status-badge";
import { StatCard, TD, TH } from "@/components/ops/stat-card";
import type { Tone } from "@/lib/ops/labels";

export const metadata = { title: "払込管理" };

const TONE: Record<string, Tone> = { requested: "warn", processing: "info", paid: "ok", rejected: "danger" };

/**
 * クリエイターからの振込申請を処理する。
 * 残高の検査は申請時に DB のトリガーが済ませているので、ここは振込作業の記録だけ。
 */
export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { requests, page, hasNext, summary } = await listPayoutRequests(sp.page);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="未処理の申請" tone="warn" value={summary.open} note={`合計 ${yen(summary.openTotal)}`} />
        <StatCard label="振込済み（累計）" tone="ok" value={yen(summary.paidTotal)} />
        <StatCard label="未申請の受取可能額" value={yen(summary.owed)} note="クリエイター全員ぶん" />
        <StatCard label="申請の件数" value={summary.total} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[900px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-ground text-[10.5px] text-muted-foreground">
              <th className={TH}>申請日時</th>
              <th className={TH}>クリエイター</th>
              <th className={`${TH} text-right`}>金額</th>
              <th className={TH}>振込先</th>
              <th className={TH}>状態</th>
              <th className={TH}>処理日時</th>
              <th className={`${TH} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[12px] text-muted-foreground">申請はまだありません。</td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className={`${TD} num text-ink`}>{shortDateTime(r.requested_at)}</td>
                <td className={`${TD} font-semibold text-ink`}>{r.profiles?.display_name ?? "—"}</td>
                <td className={`${TD} num text-right font-semibold text-ink`}>{yen(r.amount)}</td>
                <td className={`${TD} text-ink`}>
                  {r.account ? (
                    <>
                      <span className="block">{r.account.bank_name} {r.account.branch_name} {r.account.account_type}</span>
                      <span className="num block text-[10px] text-muted-foreground">{r.account.account_number} {r.account.account_holder_name}</span>
                    </>
                  ) : (
                    <span className="text-danger">口座未登録</span>
                  )}
                </td>
                <td className={TD}><Pill tone={TONE[r.status]}>{PAYOUT_STATUS_LABEL[r.status]}</Pill></td>
                <td className={`${TD} num text-muted-foreground`}>{r.processed_at ? shortDateTime(r.processed_at) : "—"}</td>
                <td className={`${TD} text-right`}><PayoutActions id={r.id} status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination path="/admin/payouts" params={sp} page={page} hasNext={hasNext} />
    </>
  );
}

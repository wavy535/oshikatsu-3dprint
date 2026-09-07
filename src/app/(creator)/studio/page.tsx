import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCreator } from "@/lib/auth/guards";
import { listMyProducts } from "@/features/products/queries";
import {
  getMyPayoutAccountStatus,
  getMySalesSummary,
  listMyPayouts,
} from "@/features/payouts/queries";
import { listMyFixRequests } from "@/features/print-jobs/queries";
import { Button } from "@/components/ui/button";

export const metadata = { title: "売上ダッシュボード" };

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-white px-4 py-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`num text-2xl font-bold ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </span>
      {sub && <span className="text-[10.5px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default async function StudioDashboardPage() {
  const { user } = await requireCreator();
  const [products, summary, payouts, account, fixRequests] = await Promise.all([
    listMyProducts(user.id),
    getMySalesSummary(user.id),
    listMyPayouts(user.id),
    getMyPayoutAccountStatus(user.id),
    listMyFixRequests(user.id),
  ]);

  const published = products.filter((p) => p.status === "published").length;
  const inReview = products.filter((p) => p.status === "in_review").length;
  const openFixes = fixRequests.filter((r) => r.status === "open").length;
  const nextPayout = payouts.find(
    (p) => p.status === "scheduled" || p.status === "unpaid"
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-ink">売上ダッシュボード</h1>
        <span className="flex-1" />
        <Button render={<Link href="/studio/products/new" />}>
          <Plus />
          作品を投稿
        </Button>
      </div>

      {openFixes > 0 && (
        <Link
          href="/studio/fix-requests"
          className="rounded-xl border border-[color:var(--danger)]/30 bg-danger-bg/40 px-4 py-3 text-[12.5px] font-medium text-danger"
        >
          対応待ちの修正依頼が {openFixes} 件あります →
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="受取予定額（確定分）"
          value={`¥${summary.pendingConfirmed.toLocaleString()}`}
          sub="受取確認済みで未振込"
          accent
        />
        <Stat
          label="見込み額（取引中）"
          value={`¥${summary.unconfirmed.toLocaleString()}`}
          sub="決済済み〜発送済み"
        />
        <Stat
          label="振込済み累計"
          value={`¥${summary.totalPaid.toLocaleString()}`}
        />
        <Stat
          label="公開中の作品"
          value={String(published)}
          sub={inReview > 0 ? `審査中 ${inReview}件` : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-bold text-ink">振込予定</p>
          {nextPayout ? (
            <dl className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">対象期間</dt>
                <dd className="num text-ink">
                  {nextPayout.period_start} 〜 {nextPayout.period_end}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">振込予定日</dt>
                <dd className="num text-ink">{nextPayout.scheduled_date ?? "未定"}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="font-semibold text-ink">振込額</dt>
                <dd className="num text-lg font-bold text-brand">
                  ¥{nextPayout.net_amount.toLocaleString()}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              締め処理済みの振込予定はまだありません。
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-bold text-ink">振込先口座</p>
          {account ? (
            <dl className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">金融機関</dt>
                <dd className="text-ink">
                  {account.bank_name}（{account.branch_name}）
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">口座種別</dt>
                <dd className="text-ink">
                  {account.account_type === "savings" ? "普通" : "当座"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">名義</dt>
                <dd className="text-ink">{account.account_holder_kana}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              振込先が未登録です。登録しないと振込できません。
            </p>
          )}
          <Button
            render={<Link href="/studio/sales" />}
            variant="outline"
            size="sm"
            className="mt-1 self-start"
          >
            {account ? "口座情報を編集" : "振込先を登録"}
          </Button>
        </div>
      </div>
    </div>
  );
}

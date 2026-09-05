import { requireCreator } from "@/lib/auth/guards";
import { getMySalesSummary, listMyPayouts, getMyPayoutAccountStatus } from "@/features/payouts/queries";
import { PayoutSummaryCard } from "@/components/payout/payout-summary-card";
import { PayoutAccountForm } from "./payout-account-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_LABEL: Record<string, string> = {
  unpaid: "未払い",
  scheduled: "支払予定",
  paid: "支払済み",
  failed: "失敗",
};

function yen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export default async function SalesPage() {
  const { user } = await requireCreator();
  const [summary, payouts, account] = await Promise.all([
    getMySalesSummary(user.id),
    listMyPayouts(user.id),
    getMyPayoutAccountStatus(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">売上・振込</h1>
      <PayoutSummaryCard
        pendingConfirmed={summary.pendingConfirmed}
        unconfirmed={summary.unconfirmed}
        totalPaid={summary.totalPaid}
      />
      <PayoutAccountForm account={account} />
      <div>
        <h2 className="mb-2 text-lg font-semibold">振込履歴</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ振込対象の月次締めがありません（前月分は毎月1日に自動集計されます）。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>対象期間</TableHead>
                <TableHead>売上</TableHead>
                <TableHead>手数料</TableHead>
                <TableHead>振込額</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>支払日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.period_start} 〜 {p.period_end}
                  </TableCell>
                  <TableCell>{yen(p.gross_amount)}</TableCell>
                  <TableCell>{yen(p.commission + p.transfer_fee)}</TableCell>
                  <TableCell>{yen(p.net_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("ja-JP") : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

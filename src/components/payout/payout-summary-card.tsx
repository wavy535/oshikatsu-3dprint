import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function yen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function PayoutSummaryCard({
  pendingConfirmed,
  unconfirmed,
  totalPaid,
}: {
  pendingConfirmed: number;
  unconfirmed: number;
  totalPaid: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">支払待ち（確定済み）</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{yen(pendingConfirmed)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">未確定（発送・受取待ち）</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{yen(unconfirmed)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">支払済み累計</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{yen(totalPaid)}</CardContent>
      </Card>
    </div>
  );
}

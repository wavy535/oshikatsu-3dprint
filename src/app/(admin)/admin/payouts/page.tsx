import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { adminListPayouts } from "@/features/payouts/queries";
import { Badge } from "@/components/ui/badge";
import { PayoutTable } from "./payout-actions";

const STATUSES = ["unpaid", "scheduled", "paid", "failed"] as const;
const STATUS_LABEL: Record<string, string> = {
  unpaid: "未払い",
  scheduled: "支払予定",
  paid: "支払済み",
  failed: "失敗",
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const validStatus = (STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof STATUSES)[number])
    : undefined;
  const payouts = await adminListPayouts({ status: validStatus });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">払込管理</h1>
      <div className="flex flex-wrap gap-2">
        {["", ...STATUSES].map((s) => (
          <Link key={s || "all"} href={s ? `/admin/payouts?status=${s}` : "/admin/payouts"} className="text-sm">
            <Badge variant={status === s || (!status && !s) ? "default" : "outline"}>
              {s ? STATUS_LABEL[s] : "すべて"}
            </Badge>
          </Link>
        ))}
      </div>
      <PayoutTable payouts={payouts} />
    </div>
  );
}

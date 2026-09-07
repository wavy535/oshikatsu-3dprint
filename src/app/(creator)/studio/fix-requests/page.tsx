import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import { listMyFixRequests } from "@/features/print-jobs/queries";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "作品の修正依頼" };

const STATUS_LABEL: Record<string, string> = {
  open: "対応待ち",
  resolved: "対応済み",
  dismissed: "取り下げ",
};

export default async function FixRequestsPage() {
  const { user } = await requireCreator();
  const requests = await listMyFixRequests(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-ink">作品の修正依頼</h1>
        <p className="text-[11.5px] text-muted-foreground">
          運営の検品で「モデル側の問題」と判定されたときに届きます。
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          修正依頼はありません
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/studio/fix-requests/${r.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand/40"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-ink">
                    {r.products?.title}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.inspector_comment ?? r.reason}
                  </span>
                </div>
                {r.reprint_fee > 0 && (
                  <span className="num text-[11px] text-danger">
                    再印刷代行費 ¥{r.reprint_fee.toLocaleString()}
                  </span>
                )}
                <Badge variant={r.status === "open" ? "destructive" : "outline"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
                <span className="num text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("ja-JP")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { listMyCustomRequests } from "@/lib/custom-orders/queries";
import { REQUEST_STATUS_LABEL } from "@/lib/custom-orders/labels";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/components/work/work-card";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const metadata = { title: "オーダーメイド相談" };

const TONE: Record<string, string> = {
  pending: "bg-ground text-muted-foreground",
  responded: "bg-brand-soft text-brand",
  accepted: "bg-ok-bg text-ok",
  declined: "bg-danger-bg text-danger",
};

/** 買う人の相談一覧。見積りが来ているものは合計金額を出す。 */
export default async function MyCustomOrdersPage() {
  const requests = await listMyCustomRequests();

  return (
    <>
      <h1 className="text-base font-bold text-ink">オーダーメイド相談</h1>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Sparkles className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">相談はまだありません</p>
          <p className="text-[12px] text-muted-foreground">
            作品ページの「オーダーメイド相談」から、サイズ・カラー・刻印などをクリエイターに相談できます。
          </p>
          <Link href="/works" className="mt-2 text-[12px] font-semibold text-brand hover:underline">作品をさがす</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => {
            const latest = [...r.custom_order_quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return (
              <Link
                key={r.id}
                href={`/mypage/custom-orders/${r.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md"
              >
                <Avatar src={r.profiles?.avatar_url} name={r.profiles?.display_name} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{r.profiles?.display_name ?? "クリエイター"}</span>
                    {r.works && <span className="text-[11px] text-muted-foreground">参考：{r.works.title}</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", TONE[r.status])}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <span className="line-clamp-1 text-[11.5px] text-muted-foreground">{r.message}</span>
                  <span className="num text-[10px] text-muted-foreground">{shortDateTime(r.created_at)}</span>
                </span>
                {latest && (
                  <span className="flex flex-col items-end">
                    <span className="num text-[13px] font-bold text-ink">
                      {yen(latest.price_jpy + latest.print_fee_jpy + latest.shipping_fee_jpy)}
                    </span>
                    <span className="num text-[9.5px] text-muted-foreground">{latest.quote_no}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

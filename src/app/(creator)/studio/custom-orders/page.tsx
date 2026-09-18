import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { listCreatorCustomRequests } from "@/lib/custom-orders/queries";
import { REQUEST_STATUS_LABEL } from "@/lib/custom-orders/labels";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const metadata = { title: "オーダーメイド相談" };

const TONE: Record<string, string> = {
  pending: "bg-danger-bg text-danger",
  responded: "bg-brand-soft text-brand",
  accepted: "bg-ok-bg text-ok",
  declined: "bg-ground text-muted-foreground",
};

/** クリエイターに届いた相談。回答待ちを先に。 */
export default async function StudioCustomOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { items: requests, page, hasNext } = await listCreatorCustomRequests(sp.page);
  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">オーダーメイド相談</h1>
        <span className="num text-[12px] text-muted-foreground">
          このページ {requests.length}件{pending > 0 ? `（回答待ち ${pending}）` : ""}
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Sparkles className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">このページに表示する相談はありません</p>
          <p className="text-[12px] text-muted-foreground">
            作品の STEP3 で「対応できるカスタマイズ」を増やすと、相談が届きやすくなります。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => {
            const latest = r.custom_order_quotes[0];
            return (
              <Link
                prefetch={false}
                key={r.id}
                href={`/studio/custom-orders/${r.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md"
              >
                <Avatar src={r.profiles?.avatar_url} name={r.profiles?.display_name} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{r.profiles?.display_name ?? "購入者"} さん</span>
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
                    <span className="num text-[12.5px] font-bold text-ink">{yen(latest.price_jpy)}</span>
                    <span className="num text-[9.5px] text-muted-foreground">{latest.quote_no}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <Pagination path="/studio/custom-orders" params={sp} page={page} hasNext={hasNext} />
    </>
  );
}

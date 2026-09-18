import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { getCreatorCustomRequest } from "@/lib/custom-orders/queries";
import { QUOTE_STATUS_LABEL, REQUEST_STATUS_LABEL, type QuoteSpecRow } from "@/lib/custom-orders/labels";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { QuoteForm } from "@/components/custom-orders/quote-form";
import { cn } from "@/lib/utils";

export const metadata = { title: "オーダーメイド相談" };

const QUOTE_TONE: Record<string, string> = {
  sent: "bg-brand-soft text-brand",
  accepted: "bg-ok-bg text-ok",
  ordered: "bg-ok-bg text-ok",
  declined: "bg-danger-bg text-danger",
  expired: "bg-ground text-muted-foreground",
  draft: "bg-ground text-muted-foreground",
  revision: "bg-warn-bg text-warn",
};

/** クリエイター側の相談詳細。相談の本文、出した見積り、新しい見積りのフォーム。 */
export default async function StudioCustomOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCreatorCustomRequest(id);
  if (!data) notFound();
  const { request: req, rule } = data;
  const quotes = req.custom_order_quotes;
  const canQuote = req.status === "pending" || req.status === "responded";
  const hasOpenQuote = quotes.some((q) => q.status === "sent" && new Date(q.expires_at) > new Date());

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/studio/custom-orders" className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-ground">
          <ChevronLeft className="size-3" aria-hidden />
          相談一覧へ
        </Link>
        <h1 className="text-[15px] font-bold text-ink">{req.profiles?.display_name ?? "購入者"} さんからの相談</h1>
        <span className="rounded-full bg-ground px-2 py-0.5 text-[10.5px] font-semibold text-ink">{REQUEST_STATUS_LABEL[req.status]}</span>
        <Link href={`/mypage/messages?with=${req.requester_id}`} className="ml-auto text-[11px] text-brand hover:underline">
          メッセージで返信する
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <div className="flex items-center gap-2.5">
              <Avatar src={req.profiles?.avatar_url} name={req.profiles?.display_name} className="size-8" />
              <span className="text-[12.5px] font-semibold text-ink">{req.profiles?.display_name}</span>
              {req.works && (
                <Link href={`/works/${req.works.id}`} className="text-[11px] text-brand hover:underline">参考作品：{req.works.title}</Link>
              )}
              <span className="num ml-auto text-[10px] text-muted-foreground">{shortDateTime(req.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-ground px-3 py-2.5 text-[12px] leading-5 text-ink">{req.message}</p>
          </section>

          {quotes.map((q) => {
            const spec = (q.spec as unknown as QuoteSpecRow[]) ?? [];
            const expired = q.status === "sent" && new Date(q.expires_at) < new Date();
            return (
              <section key={q.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[12.5px] font-bold text-ink">{q.quote_no}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", QUOTE_TONE[expired ? "expired" : q.status])}>
                    {expired ? "期限切れ" : QUOTE_STATUS_LABEL[q.status]}
                  </span>
                  <span className="num text-[10.5px] text-muted-foreground">有効期限 {shortDateTime(q.expires_at)}</span>
                  <span className="num ml-auto text-[12px] font-semibold text-ink">
                    {yen(q.price_jpy)} <span className="text-[10px] font-normal text-muted-foreground">＋ 代行費 {yen(q.print_fee_jpy)} ＋ 送料 {yen(q.shipping_fee_jpy)}</span>
                  </span>
                </div>
                {spec.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {spec.map((s) => `${s.item}：${s.decided}`).join("　／　")}
                  </p>
                )}
                <p className="num text-[10.5px] text-muted-foreground">
                  {q.est_filament_grams}g ・ {q.est_print_hours}h ・ {q.part_count}パーツ ・ 納期 {q.lead_time_days}日
                  {q.note ? ` ・ ${q.note}` : ""}
                </p>
              </section>
            );
          })}

          {canQuote && !hasOpenQuote && (
            <QuoteForm requestId={req.id} baseWorkId={req.works?.id} rule={rule} />
          )}
          {canQuote && hasOpenQuote && (
            <p className="rounded-xl border border-line bg-white p-4 text-[12px] text-muted-foreground">
              提示中の見積りがあります。購入者の返事（承認・辞退）か、有効期限切れのあとに次の見積りを出せます。
            </p>
          )}
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12px] font-semibold text-ink">見積りの決まり</h2>
            {[
              "印刷代行費は推定フィラメント・造形時間・パーツ数から料金表の式で出ます（手数料の対象外）。",
              "受取は作品代金の80%が見込みです。発送後に実費で確定します。",
              "承認されると、購入者専用のサイズ（1点）が作られてカートに入ります。他の人には見えません。",
              "有効期限は提示から7日です。",
            ].map((t) => (
              <p key={t} className="text-[10.5px] leading-4 text-muted-foreground">・{t}</p>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

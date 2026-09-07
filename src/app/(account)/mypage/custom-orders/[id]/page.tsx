import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Clock } from "lucide-react";

import { getMyCustomRequest } from "@/lib/custom-orders/queries";
import { QUOTE_STATUS_LABEL, REQUEST_STATUS_LABEL, type QuoteSpecRow } from "@/lib/custom-orders/labels";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/components/work/work-card";
import { Avatar } from "@/components/ui/avatar";
import { QuoteActions } from "@/components/custom-orders/quote-actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "オーダーメイド見積り" };

const QUOTE_TONE: Record<string, string> = {
  sent: "bg-brand-soft text-brand",
  accepted: "bg-ok-bg text-ok",
  ordered: "bg-ok-bg text-ok",
  declined: "bg-danger-bg text-danger",
  expired: "bg-ground text-muted-foreground",
  draft: "bg-ground text-muted-foreground",
  revision: "bg-warn-bg text-warn",
};

/**
 * Figma ③やりとり「オーダーメイド見積り・お支払い 2096:1389」。
 * 相談の内容と、クリエイターからの見積り（最新を上に）。提示中の見積りは承認／辞退できる。
 */
export default async function MyCustomOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await getMyCustomRequest(id);
  if (!req) notFound();

  const quotes = req.custom_order_quotes;
  const active = quotes.find((q) => q.status === "sent" || q.status === "accepted" || q.status === "ordered");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/mypage/custom-orders" className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-ground">
          <ChevronLeft className="size-3" aria-hidden />
          相談一覧へ
        </Link>
        <h1 className="text-[15px] font-bold text-ink">
          オーダーメイド相談{active?.quote_no ? <span className="num">　{active.quote_no}</span> : ""}
        </h1>
        <span className="rounded-full bg-ground px-2 py-0.5 text-[10.5px] font-semibold text-ink">{REQUEST_STATUS_LABEL[req.status]}</span>
        <Link href={`/mypage/messages?with=${req.creator_id}`} className="ml-auto text-[11px] text-brand hover:underline">
          相談スレッドを開く
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <div className="flex items-center gap-2.5">
              <Avatar src={req.profiles?.avatar_url} name={req.profiles?.display_name} className="size-8" />
              <span className="text-[12.5px] font-semibold text-ink">{req.profiles?.display_name}</span>
              {req.works && (
                <Link href={`/works/${req.works.id}`} className="text-[11px] text-brand hover:underline">
                  参考作品：{req.works.title}
                </Link>
              )}
              <span className="num ml-auto text-[10px] text-muted-foreground">{shortDateTime(req.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-ground px-3 py-2.5 text-[12px] leading-5 text-ink">{req.message}</p>
          </section>

          {quotes.length === 0 ? (
            <section className="flex items-center gap-2 rounded-xl border border-line bg-white p-4 text-[12px] text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              クリエイターからの見積りを待っています。やりとりはメッセージで行えます。
            </section>
          ) : (
            quotes.map((q) => {
              const spec = (q.spec as unknown as QuoteSpecRow[]) ?? [];
              const total = q.price_jpy + q.print_fee_jpy + q.shipping_fee_jpy;
              const expired = q.status === "sent" && new Date(q.expires_at) < new Date();
              return (
                <section key={q.id} className={cn("flex flex-col gap-3 rounded-xl border bg-white p-4", q.status === "sent" && !expired ? "border-brand" : "border-line")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[13px] font-bold text-ink">{q.quote_no}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", QUOTE_TONE[expired ? "expired" : q.status])}>
                      {expired ? "期限切れ" : QUOTE_STATUS_LABEL[q.status]}
                    </span>
                    {q.status === "sent" && (
                      <span className={cn("num text-[11px]", expired ? "text-danger" : "text-warn")}>有効期限 {shortDateTime(q.expires_at)}</span>
                    )}
                    <span className="num ml-auto text-[10px] text-muted-foreground">{shortDateTime(q.created_at)}</span>
                  </div>

                  {spec.length > 0 && (
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-ground text-[10.5px] text-muted-foreground">
                          <th className="px-2.5 py-1.5 text-left font-semibold">項目</th>
                          <th className="px-2.5 py-1.5 text-left font-semibold">確定内容</th>
                          <th className="px-2.5 py-1.5 text-left font-semibold">相談時のご希望</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spec.map((row, i) => (
                          <tr key={i} className="border-t border-line">
                            <td className="px-2.5 py-1.5 text-muted-foreground">{row.item}</td>
                            <td className="px-2.5 py-1.5 font-semibold text-ink">{row.decided}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">{row.requested ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["推定フィラメント", `${q.est_filament_grams ?? "—"} g`],
                      ["推定造形時間", `${q.est_print_hours ?? "—"} h`],
                      ["パーツ数", `${q.part_count}`],
                      ["お届け目安", `承認から${q.lead_time_days}日`],
                    ].map(([l, v]) => (
                      <span key={l} className="flex flex-col rounded-lg border border-line bg-ground px-3 py-2">
                        <span className="text-[9.5px] text-muted-foreground">{l}</span>
                        <span className="num text-[14px] font-bold text-ink">{v}</span>
                      </span>
                    ))}
                  </div>
                  {q.note && <p className="text-[11.5px] text-ink">{q.note}</p>}

                  <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row">
                    <dl className="flex flex-1 flex-col gap-1 text-[11.5px]">
                      <div className="flex justify-between"><dt className="text-muted-foreground">作品代金（オーダーメイド）</dt><dd className="num text-ink">{yen(q.price_jpy)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">印刷代行費</dt><dd className="num text-ink">{yen(q.print_fee_jpy)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">送料</dt><dd className="num text-ink">{yen(q.shipping_fee_jpy)}</dd></div>
                      <div className="flex justify-between border-t border-line pt-1"><dt className="font-semibold text-ink">合計（税込）</dt><dd className="num text-[16px] font-bold text-ink">{yen(total)}</dd></div>
                    </dl>
                    <div className="w-full sm:w-64">
                      {q.status === "sent" ? (
                        <QuoteActions quoteId={q.id} requestId={req.id} creatorId={req.creator_id} expired={expired} />
                      ) : q.status === "accepted" ? (
                        <div className="flex flex-col gap-2 rounded-lg bg-ok-bg p-3 text-[11.5px] text-ok">
                          <span className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="size-4" aria-hidden />承認済み。カートから支払いに進めます</span>
                          <Link href="/cart" className="font-semibold underline">カートへ</Link>
                        </div>
                      ) : q.status === "ordered" ? (
                        <p className="rounded-lg bg-ok-bg p-3 text-[11.5px] font-semibold text-ok">注文済み。進み具合は購入履歴で確認できます</p>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12px] font-semibold text-ink">承認前にご確認ください</h2>
            {[
              "この作品はあなた専用として1点だけ作られ、他の方は購入できません。",
              "承認すると専用のサイズがカートに入ります。支払いは通常の決済と同じです。",
              "印刷が始まるとキャンセルできません。",
              "有効期限を過ぎると見積りは無効になり、メッセージから再依頼が必要です。",
            ].map((t) => (
              <p key={t} className="text-[10.5px] leading-4 text-muted-foreground">・{t}</p>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";

import { getWork } from "@/lib/works/queries";
import { listWorkQna } from "@/lib/qna/queries";
import { getOptionalUser } from "@/lib/auth/guards";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/components/work/work-card";
import { AnswerForm, AskQuestionForm } from "@/components/work/qna-forms";

export const metadata = { title: "Q&A・発送" };

/**
 * Figma ①購入フロー「作品詳細（Q&A・発送）」。
 * Q&A は公開。回答はその作品のクリエイターだけ（RLS）。
 */
export default async function WorkQaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [work, qna, { user }] = await Promise.all([getWork(id), listWorkQna(id), getOptionalUser()]);
  if (!work) notFound();
  const isCreator = !!user && user.id === work.creator_id;
  const answered = qna.threads.filter((t) => t.answer).length;

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-3 px-6 py-5">
      <Link href={`/works/${id}`} className="text-[11px] font-semibold text-brand hover:underline">‹ 作品詳細に戻る</Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[18px] font-bold text-ink">{work.title}</h1>
        <Link href={`/creators/${work.creator_id}`} className="text-[11px] text-muted-foreground hover:text-brand">{work.profiles?.display_name}</Link>
      </div>
      <div className="flex gap-2">
        <Link href={`/works/${id}/reviews`} className="rounded-full border border-line bg-white px-3 py-1 text-[11px] text-ink hover:bg-ground">レビュー</Link>
        <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">Q&amp;A・発送 {qna.threads.length}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!isCreator && <AskQuestionForm workId={id} loggedIn={!!user} />}
          {isCreator && qna.threads.length > answered && (
            <p className="rounded-xl bg-warn-bg px-4 py-2.5 text-[11.5px] text-warn">
              未回答の質問が {qna.threads.length - answered} 件あります。回答は作品ページに公開されます。
            </p>
          )}
          {qna.threads.length === 0 ? (
            <p className="rounded-xl border border-line bg-white px-6 py-12 text-center text-[12px] text-muted-foreground">
              まだ質問はありません。サイズ・色・組み立てなど、気になることを聞いてみましょう。
            </p>
          ) : (
            qna.threads.map((t) => (
              <article key={t.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                <div className="flex items-start gap-2">
                  <span className="rounded bg-ground px-1.5 text-[10.5px] font-bold text-ink">Q</span>
                  <p className="flex-1 text-[12.5px] font-semibold text-ink">{t.question}</p>
                </div>
                <p className="num pl-6 text-[10px] text-muted-foreground">
                  {t.profiles?.display_name ?? "ユーザー"} ・ {shortDateTime(t.created_at)}
                </p>
                {t.answer ? (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="rounded bg-brand-soft px-1.5 text-[10.5px] font-bold text-brand">A</span>
                      <p className="flex-1 whitespace-pre-wrap text-[11.5px] leading-5 text-ink">{t.answer}</p>
                    </div>
                    <p className="num pl-6 text-[10px] text-muted-foreground">
                      {work.profiles?.display_name} ・ {shortDateTime(t.answered_at)}
                    </p>
                  </>
                ) : isCreator ? (
                  <AnswerForm threadId={t.id} workId={id} />
                ) : (
                  <p className="pl-6 text-[10.5px] text-muted-foreground">クリエイターの回答を待っています。</p>
                )}
              </article>
            ))
          )}
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[330px] lg:flex-none">
          <section className="flex flex-col rounded-xl border border-line bg-white p-4">
            <h2 className="mb-2.5 text-[13px] font-bold text-ink">発送・お支払い</h2>
            {[
              ["お届け目安", "7〜10日", "受注生産です。印刷1〜3日＋検品＋発送。"],
              ["送料", qna.shippingFee !== null ? `${yen(qna.shippingFee)}（全国一律）` : "—", "ヤマト運輸 宅急便コンパクト。"],
              ["お支払い", "クレジットカード", "支払いが済むと印刷の準備に入ります。"],
              ["返品", "不良品を除き不可", "受注生産のためご了承ください。不良は検品で運営が止めます。"],
            ].map(([k, v, d], i) => (
              <div key={k} className={`flex gap-2.5 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="w-[74px] flex-none text-[11px] text-muted-foreground">{k}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold text-ink">{v}</span>
                  <span className="text-[10.5px] text-muted-foreground">{d}</span>
                </span>
              </div>
            ))}
            <p className="mt-1 flex items-start gap-1.5 text-[10.5px] text-muted-foreground">
              <Info className="mt-0.5 size-3 flex-none" aria-hidden />
              販売価格とは別に、印刷代行費がかかります。金額はサイズごとに作品ページで確認できます。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

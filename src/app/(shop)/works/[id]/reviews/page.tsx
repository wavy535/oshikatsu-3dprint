import Link from "next/link";
import { notFound } from "next/navigation";
import { Info, Star } from "lucide-react";

import { getWork, listWorkReviews } from "@/lib/works/queries";
import { shortDateTime } from "@/lib/ops/labels";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const metadata = { title: "レビュー" };

function Stars({ value, size = "size-3.5" }: { value: number | null; size?: string }) {
  const v = value ?? 0;
  return (
    <span className="flex items-center gap-0.5" aria-label={`評価 ${v.toFixed(1)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= Math.round(v) ? "fill-star text-star" : "text-line")} aria-hidden />
      ))}
    </span>
  );
}

function AxisBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-ink">{label}</span>
        <span className="num font-semibold text-ink">{value === null ? "—" : value.toFixed(1)}</span>
      </div>
      <span className="block h-1.5 w-full rounded-full bg-ground">
        <i className="block h-1.5 rounded-full bg-brand" style={{ width: `${((value ?? 0) / 5) * 100}%` }} />
      </span>
    </div>
  );
}

/**
 * Figma ①購入フロー「作品詳細（レビュー）」。作品詳細から切り出した1枚。
 * 項目別はクリエイター向けの3軸だけ。印刷品質・梱包・配送は運営あて（設計判断8）。
 */
export default async function WorkReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [work, reviews] = await Promise.all([getWork(id), listWorkReviews(id)]);
  if (!work) notFound();
  const max = Math.max(...reviews.distribution.map((d) => d.count), 1);

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-3 px-6 py-5">
      <Link href={`/works/${id}`} className="text-[11px] font-semibold text-brand hover:underline">‹ 作品詳細に戻る</Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[18px] font-bold text-ink">{work.title}</h1>
        <Link href={`/creators/${work.creator_id}`} className="text-[11px] text-muted-foreground hover:text-brand">{work.profiles?.display_name}</Link>
      </div>
      <div className="flex gap-2">
        <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">レビュー {reviews.count}</span>
        <Link href={`/works/${id}/qa`} className="rounded-full border border-line bg-white px-3 py-1 text-[11px] text-ink hover:bg-ground">Q&amp;A・発送</Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {reviews.rows.length === 0 ? (
            <p className="rounded-xl border border-line bg-white px-6 py-12 text-center text-[12px] text-muted-foreground">
              まだレビューはありません。届いた作品を評価すると、ここに載ります。
            </p>
          ) : (
            reviews.rows.map((r) => (
              <article key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Avatar src={r.is_anonymous ? null : r.profiles?.avatar_url} name={r.is_anonymous ? "匿" : r.profiles?.display_name} className="size-6 text-[10px]" />
                  <span className="text-[12.5px] font-semibold text-ink">{r.is_anonymous ? "匿名" : r.profiles?.display_name ?? "購入者"}</span>
                  <Stars value={r.rating} />
                  <span className="num text-[10.5px] text-muted-foreground">{shortDateTime(r.created_at)}</span>
                  <span className="ml-auto flex gap-1.5">
                    {r.order_items?.size_label_snapshot && (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">{r.order_items.size_label_snapshot}</span>
                    )}
                    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-semibold text-ok">購入済み</span>
                  </span>
                </div>
                {r.comment && <p className="text-[11.5px] leading-5 text-ink">{r.comment}</p>}
              </article>
            ))
          )}
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[330px] lg:flex-none">
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[13px] font-bold text-ink">評価のまとめ</h2>
            <div className="flex items-center gap-3">
              <span className="num text-[36px] leading-12 font-bold text-ink">{reviews.avg ? reviews.avg.toFixed(1) : "—"}</span>
              <span className="flex flex-col gap-0.5">
                <Stars value={reviews.avg} size="size-4" />
                <span className="num text-[10.5px] text-muted-foreground">{reviews.count}件のレビュー</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {reviews.distribution.map((d) => (
                <div key={d.star} className="flex items-center gap-2">
                  <span className="num w-2 text-[10.5px] text-muted-foreground">{d.star}</span>
                  <span className="block h-1.5 flex-1 rounded-full bg-ground">
                    <i className="block h-1.5 rounded-full bg-star" style={{ width: `${(d.count / max) * 100}%` }} />
                  </span>
                  <span className="num w-5 text-right text-[10.5px] text-muted-foreground">{d.count}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-line" />
            <AxisBar label="デザイン・完成度" value={reviews.avgDesign} />
            <AxisBar label="説明との一致" value={reviews.avgAccuracy} />
            <AxisBar label="サイズ感" value={reviews.avgSizeFit} />
            <p className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground">
              <Info className="mt-0.5 size-3 flex-none" aria-hidden />
              印刷品質・梱包・配送は運営への評価として別に集計しています。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageCircle, Sparkles, Star } from "lucide-react";

import { getCreatorProfile, listCreatorReviews, snsEntries } from "@/lib/creators/queries";
import { listWorks } from "@/lib/works/queries";
import { shortDateTime } from "@/lib/ops/labels";
import { Avatar } from "@/components/ui/avatar";
import { WorkCard } from "@/components/work/work-card";
import { FollowButton } from "@/components/creator/follow-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "クリエイター" };

function Stars({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <span className="flex items-center gap-0.5" aria-label={`評価 ${v.toFixed(1)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= Math.round(v) ? "fill-star text-star" : "text-line")} aria-hidden />
      ))}
    </span>
  );
}

/**
 * Figma ②出品フロー「クリエイター公開ページ」。
 * 作品一覧／レビューのタブ。フォロー・メッセージ・オーダーメイド相談の入口。
 */
export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getCreatorProfile(id);
  if (!data) notFound();
  const { profile, stats, rating, isFollowing, viewerId } = data;
  const tab = sp.tab === "reviews" ? "reviews" : "works";

  const [{ items: works, total }, reviews] = await Promise.all([
    listWorks({ creatorId: id, sort: "popular", page: 1 }),
    tab === "reviews" ? listCreatorReviews(id) : Promise.resolve([]),
  ]);
  const sns = snsEntries(profile.sns_links);
  const isSelf = viewerId === id;

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-6 py-6">
      <section className="flex flex-col gap-5 rounded-xl border border-line bg-white p-6 lg:flex-row lg:items-start">
        <Avatar src={profile.avatar_url} name={profile.display_name} className="size-[84px] text-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-[22px] font-bold text-ink">{profile.display_name}</h1>
          {profile.bio && <p className="text-[12px] leading-5 text-muted-foreground">{profile.bio}</p>}
          <div className="flex flex-wrap items-baseline gap-5 pt-1">
            <span className="flex items-baseline gap-1"><span className="num text-[15px] font-bold text-ink">{stats?.works_count ?? 0}</span><span className="text-[10.5px] text-muted-foreground">投稿作品</span></span>
            <span className="flex items-baseline gap-1"><span className="num text-[15px] font-bold text-ink">{stats?.follower_count ?? 0}</span><span className="text-[10.5px] text-muted-foreground">フォロワー</span></span>
            <span className="flex items-baseline gap-1"><span className="num text-[15px] font-bold text-ink">{(stats?.sold_count ?? 0).toLocaleString("ja-JP")}</span><span className="text-[10.5px] text-muted-foreground">販売実績</span></span>
            <span className="flex items-center gap-1.5">
              <Stars value={rating?.avg_rating ?? null} />
              <span className="num text-[12px] font-semibold text-ink">{rating?.avg_rating ? Number(rating.avg_rating).toFixed(1) : "—"}</span>
              <span className="text-[10.5px] text-muted-foreground">（{rating?.review_count ?? 0}件）</span>
            </span>
          </div>
          {sns.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-1">
              {sns.map((s) => (
                <a key={s.key} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] text-brand hover:underline">
                  <ExternalLink className="size-3" aria-hidden />
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
        {!isSelf && (
          <div className="flex w-full flex-col gap-2 lg:w-[210px]">
            <FollowButton creatorId={id} isFollowing={isFollowing} loggedIn={!!viewerId} />
            <Link
              href={`/mypage/messages?with=${id}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2.5 text-[12px] font-semibold text-ink hover:bg-ground"
            >
              <MessageCircle className="size-4" aria-hidden />
              メッセージ
            </Link>
            <Link
              href={`/mypage/custom-orders/new?creator=${id}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2.5 text-[12px] font-semibold text-ink hover:bg-ground"
            >
              <Sparkles className="size-4" aria-hidden />
              オーダーメイド相談
            </Link>
          </div>
        )}
      </section>

      <div className="flex gap-6 border-b border-line px-1">
        {[
          { key: "works", label: `作品一覧（${total}）`, href: `/creators/${id}` },
          { key: "reviews", label: `レビュー（${rating?.review_count ?? 0}）`, href: `/creators/${id}?tab=reviews` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "border-b-[2.5px] pb-2 pt-1 text-[12.5px]",
              tab === t.key ? "border-brand font-semibold text-brand" : "border-transparent text-muted-foreground hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "works" ? (
        works.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-6 py-12 text-center text-[12px] text-muted-foreground">公開中の作品はまだありません。</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {works.map((w) => <WorkCard key={w.id} item={w} />)}
          </div>
        )
      ) : reviews.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-6 py-12 text-center text-[12px] text-muted-foreground">レビューはまだありません。</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reviews.map((r) => (
            <article key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
              <div className="flex items-center gap-2.5">
                <Avatar src={r.is_anonymous ? null : r.profiles?.avatar_url} name={r.is_anonymous ? "匿" : r.profiles?.display_name} className="size-6 text-[10px]" />
                <span className="text-[12px] font-semibold text-ink">{r.is_anonymous ? "匿名" : r.profiles?.display_name ?? "購入者"}</span>
                <Stars value={r.rating} />
                <span className="num ml-auto text-[10px] text-muted-foreground">{shortDateTime(r.created_at)}</span>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                <Link href={`/works/${r.works?.id}`} className="text-brand hover:underline">{r.works?.title}</Link>
                {r.order_items?.size_label_snapshot ? ` ／ ${r.order_items.size_label_snapshot}` : ""}
              </p>
              {r.comment && <p className="text-[11.5px] leading-5 text-ink">{r.comment}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

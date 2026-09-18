import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageIcon, MessageSquare, Package, Star, Truck } from "lucide-react";

import { getNuiFit, getWork, getWorkReviewSummary, isFavorited } from "@/lib/works/queries";
import { getShellContext } from "@/lib/layout/queries";
import { listMyNuis } from "@/lib/nuis/queries";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { FavoriteButton } from "@/components/work/favorite-button";
import { AddToCartForm } from "@/components/work/add-to-cart-form";
import { WorkArPanel, WorkArPanelFallback } from "@/components/work/work-ar-panel";
import { NuiFitCard } from "@/components/work/nui-fit-card";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = await getWork(id);
  return { title: work?.title ?? "作品" };
}

/**
 * Figma ①購入フロー「作品詳細 46:1738」。
 * 左が画像と説明、右の InfoPanel が
 * 価格 → サイズ選択 → 相性 → CTA → 発送サマリ → クリエイター → レビュー → Q&A の順。
 *
 * 選択中のサイズは URL の `?size=`、AR に出すぬいは `?nui=` が持つ。サーバー側で組み立てるので、
 * 相性判定も AR も選択に合わせて出し直せる。
 */
export default async function WorkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string; nui?: string }>;
}) {
  const [{ id }, { size, nui: nuiId }] = await Promise.all([params, searchParams]);
  const work = await getWork(id);
  if (!work || work.status !== "published") notFound();

  const shell = await getShellContext();
  const variants = work.work_variants;
  const selected = variants.find((v) => v.id === size) ?? variants[0] ?? null;

  const [review, fit, favorited, myNuis] = await Promise.all([
    getWorkReviewSummary(work.id),
    selected && shell.mainNui ? getNuiFit(selected.id, shell.mainNui.id) : Promise.resolve(null),
    shell.user ? isFavorited(work.id, shell.user.id) : Promise.resolve(false),
    shell.user ? listMyNuis() : Promise.resolve([]),
  ]);

  const selectedNuiId = myNuis.find((nui) => nui.id === nuiId)?.id;
  // サイズを選び直しても、AR に出すぬいは持ち回る
  const sizeHref = (variantId: string) => {
    const query = new URLSearchParams({ size: variantId });
    if (selectedNuiId) query.set("nui", selectedNuiId);
    return `/works/${work.id}?${query}`;
  };

  const creator = work.profiles;
  const images = work.work_images;
  const mainImage = workImageUrl(images[0]?.storage_path);
  const tags = (work.work_tags ?? []).map((t) => t.tags).filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-6 px-4 sm:px-6 py-6 lg:flex-row">
      {/* 左: 画像と説明 */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
          {mainImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mainImage} alt="" fetchPriority="high" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-8 text-line" aria-hidden />
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2">
            {images.map((img) => (
              <span
                key={img.id}
                className="size-16 overflow-hidden rounded-lg border border-line bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={workImageUrl(img.storage_path) ?? ""}
                  alt=""
                  className="size-full object-cover"
                />
              </span>
            ))}
          </div>
        )}

        <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold text-ink">この作品について</h2>
          <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink">{work.description}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Link
                  key={t!.id}
                  href={
                    t!.type === "category"
                      ? `/works?category=${t!.slug}`
                      : `/works?worldview=${t!.slug}`
                  }
                  className="rounded-full bg-ground px-2.5 py-1 text-[11px] text-muted-foreground hover:text-ink"
                >
                  {t!.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 右: InfoPanel */}
      <div className="flex w-full flex-col gap-4 lg:w-[380px]">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <div className="flex items-start gap-2">
            <h1 className="flex-1 text-lg leading-6 font-bold text-ink">{work.title}</h1>
            <FavoriteButton
              workId={work.id}
              favorited={favorited}
              count={work.favorite_count ?? 0}
              signedIn={Boolean(shell.user)}
            />
          </div>

          {/* 印刷代行費は作品価格に上乗せして請求するので、支払額と内訳を出す */}
          <div className="flex flex-col gap-0.5">
            <p className="num text-2xl font-bold text-ink">
              {yen(selected?.buyer_total_jpy ?? null)}
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">税込</span>
            </p>
            {selected && (
              <p className="num text-[11px] text-muted-foreground">
                作品 {yen(selected.price_jpy)} ＋ 印刷代行費 {yen(selected.print_fee_jpy)}
              </p>
            )}
          </div>

          {/* サイズ展開 */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">対応ぬいサイズ</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const soldOut = (v.stock ?? 0) <= 0;
                return (
                  <Link
                    key={v.id}
                    href={sizeHref(v.id)}
                    scroll={false}
                    className={cn(
                      "flex min-w-[86px] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-center transition-colors",
                      v.id === selected?.id
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-white hover:border-brand/40",
                      soldOut && "opacity-60"
                    )}
                  >
                    <span className="text-[12.5px] font-semibold text-ink">{v.size_label}</span>
                    <span className="num text-[11px] text-muted-foreground">
                      {yen(v.buyer_total_jpy)}
                    </span>
                    {soldOut && <span className="text-[10px] text-danger">在庫なし</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* AR で実寸を見る（ぬいを選べばそのぬいに合うサイズ、選ばなければ選択中のサイズ） */}
          <Suspense fallback={<WorkArPanelFallback />}>
            <WorkArPanel
              workId={work.id}
              variants={variants}
              selected={selected}
              signedIn={Boolean(shell.user)}
              nuis={myNuis}
              nuiId={nuiId}
            />
          </Suspense>

          {/* マイぬいとの相性 */}
          <NuiFitCard
            fit={fit}
            nuiName={shell.mainNui?.name ?? null}
            signedIn={Boolean(shell.user)}
            hasNui={Boolean(shell.mainNui)}
          />

          {/* CTA */}
          <AddToCartForm
            variantId={selected?.id ?? null}
            stock={selected?.stock ?? 0}
            signedIn={Boolean(shell.user)}
          />

          {/* 発送サマリ */}
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Truck className="size-3.5" aria-hidden />
            印刷から発送まで運営が代行。目安 5〜10日で発送
          </p>
          {selected && (
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Package className="size-3.5" aria-hidden />
              <span className="num">{selected.part_count}</span>パーツ / 造形時間の目安{" "}
              <span className="num">{selected.est_print_hours}</span>時間
            </p>
          )}
        </div>

        {/* クリエイター */}
        <Link
          href={`/creators/${work.creator_id}`}
          className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:bg-ground"
        >
          <Avatar src={creator?.avatar_url} name={creator?.display_name} className="size-9" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink">
              {creator?.display_name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {creator?.bio || "クリエイター"}
            </span>
          </span>
        </Link>

        {/* 相談の入口（③やりとり）。カスタマイズを1つも受けていない作品は相談ボタンを出さない */}
        <div className="flex gap-2">
          {(work.accepts_color_change || work.accepts_mirror || work.accepts_stand_hole ||
            work.accepts_custom_size || work.accepts_other_request) && (
            <Link
              href={`/mypage/custom-orders/new?creator=${work.creator_id}&work=${work.id}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand bg-white px-3 py-2.5 text-[12px] font-semibold text-brand hover:bg-brand-soft"
            >
              <MessageSquare className="size-3.5" aria-hidden />
              オーダーメイド相談
            </Link>
          )}
          <Link
            href={`/mypage/messages?with=${work.creator_id}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-[12px] font-semibold text-ink hover:bg-ground"
          >
            メッセージを送る
          </Link>
        </div>

        {/* レビュー行 */}
        <Link
          href={`/works/${work.id}/reviews`}
          className="flex items-center gap-2 rounded-xl border border-line bg-white p-4 hover:bg-ground"
        >
          <Star className="size-4 fill-star text-star" aria-hidden />
          <span className="num text-[13px] font-semibold text-ink">
            {review.avg ? review.avg.toFixed(1) : "—"}
          </span>
          <span className="text-[12px] text-muted-foreground">
            レビュー<span className="num">{review.count}</span>件
          </span>
          <span className="ml-auto text-[11px] text-brand">すべて見る</span>
        </Link>

        {/* Q&A・発送行 */}
        <Link
          href={`/works/${work.id}/qa`}
          className="flex items-center gap-2 rounded-xl border border-line bg-white p-4 hover:bg-ground"
        >
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-[12.5px] text-ink">Q&A・発送について</span>
          <span className="ml-auto text-[11px] text-brand">見る</span>
        </Link>
      </div>
    </div>
  );
}

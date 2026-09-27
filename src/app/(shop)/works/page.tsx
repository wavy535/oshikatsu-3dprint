import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { ArrowRight, Search, SearchX, X } from "lucide-react";

import { listFilterTags, listWorks } from "@/lib/works/queries";
import { PAGE_SIZE, SORTS, type Sort } from "@/lib/works/list-options";
import {
  buildWorksHref,
  parseWorkFilters,
  type RawSearchParams,
} from "@/lib/works/search-params";
import { getShellContext } from "@/lib/layout/queries";
import { WorkCard } from "@/components/work/work-card";
import { WorkFilterSidebar } from "@/components/work/work-filter-sidebar";
import { Button } from "@/components/ui/button";
import { WorkSortSelect } from "@/components/work/work-sort-select";

export const metadata = { title: "作品をさがす" };

/**
 * Figma ⓪共通「検索結果 46:1290」。
 * 絞り込みは左サイドバー、並べ替えは右上。状態はURLのクエリだけが持つ。
 */
export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const shell = await getShellContext();

  // 対応ぬいサイズは、指定が無ければメインのマイぬいのサイズを既定にする
  const filters = parseWorkFilters(sp, shell.mainNui?.nui_size_cm);
  const [{ items, total }, tags] = await Promise.all([
    listWorks(filters),
    listFilterTags(),
  ]);

  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const sortHrefs = Object.fromEntries(
    (Object.keys(SORTS) as Sort[]).map((s) => [
      s,
      buildWorksHref(sp, { sort: s }),
    ]),
  ) as Record<Sort, string>;

  const usingNuiDefault =
    sp.nuiSize === undefined && shell.mainNui?.nui_size_cm;

  const hasFilters = Boolean(
    filters.q ||
    filters.category ||
    filters.worldview ||
    filters.nuiSizeCm ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined,
  );
  const activeFilters = [
    ...(filters.q
      ? [
          {
            label: `「${filters.q}」`,
            href: buildWorksHref(sp, { q: undefined }),
          },
        ]
      : []),
    ...(filters.nuiSizeCm
      ? [
          {
            label: `${filters.nuiSizeCm}cm`,
            href: buildWorksHref(sp, { nuiSize: "" }),
          },
        ]
      : []),
    ...(filters.category
      ? [
          {
            label:
              tags.categories.find((tag) => tag.slug === filters.category)
                ?.name ?? filters.category,
            href: buildWorksHref(sp, { category: undefined }),
          },
        ]
      : []),
    ...(filters.worldview
      ? [
          {
            label:
              tags.worldviews.find((tag) => tag.slug === filters.worldview)
                ?.name ?? filters.worldview,
            href: buildWorksHref(sp, { worldview: undefined }),
          },
        ]
      : []),
    ...(filters.priceMin !== undefined || filters.priceMax !== undefined
      ? [
          {
            label: `¥${filters.priceMin ?? 0}〜${filters.priceMax ? `¥${filters.priceMax}` : ""}`,
            href: buildWorksHref(sp, {
              priceMin: undefined,
              priceMax: undefined,
            }),
          },
        ]
      : []),
  ];

  return (
    <div className="page-shell flex flex-1 flex-col gap-6">
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          うちの子に似合う、小さな世界。
        </p>
        <h1 className="page-title">
          {filters.q ? `「${filters.q}」の検索結果` : "作品をさがす"}
        </h1>
      </div>
      <form
        action="/works"
        role="search"
        className="flex items-center gap-2 rounded-xl border border-input bg-white p-1 pl-3 lg:hidden"
      >
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          aria-label="作品を検索"
          placeholder="おうち・家具・小物を検索"
          className="min-w-0 flex-1 text-base outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" type="submit">
          検索
        </Button>
      </form>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <WorkFilterSidebar
          sp={sp}
          filters={filters}
          categories={tags.categories}
          worldviews={tags.worldviews}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <p className="text-sm text-muted-foreground">
              <strong className="num text-lg text-ink">{total}</strong> 件の作品
            </p>
            <WorkSortSelect value={filters.sort} hrefFor={sortHrefs} />
          </div>
          {activeFilters.length > 0 && (
            <div aria-label="選択中の条件" className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <Link
                  key={filter.label}
                  href={filter.href}
                  aria-label={`${filter.label}の条件を解除`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm text-ink"
                >
                  {filter.label}
                  <X className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          )}
          {usingNuiDefault ? (
            <p className="rounded-xl bg-brand-soft p-4 text-sm text-brand">
              {shell.mainNui?.name}のサイズに合う作品を表示しています。
              <Link
                href={buildWorksHref(sp, { nuiSize: "" })}
                className="ml-2 underline underline-offset-4"
              >
                すべて見る
              </Link>
            </p>
          ) : null}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-white px-5 py-14 text-center sm:px-8">
              <span className="flex size-16 items-center justify-center rounded-full bg-ground">
                <SearchX className="size-7 text-brand" aria-hidden />
              </span>
              <h2 className="text-xl font-semibold">
                {hasFilters
                  ? "条件に合う作品が見つかりませんでした"
                  : "作品はただいま準備中です"}
              </h2>
              <p className="max-w-sm text-sm leading-7 text-muted-foreground">
                {hasFilters
                  ? "サイズやカテゴリを変えると、ほかの作品に出会えるかもしれません。"
                  : "公開された作品はここに並びます。先にマイぬいを登録して、お気に入りを迎える準備をしませんか。"}
              </p>
              <Button asChild variant="outline">
                <Link href={hasFilters ? "/works?nuiSize=" : "/mypage/nuis"}>
                  {hasFilters ? "条件をクリアしてさがす" : "マイぬいを登録する"}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => (
                <WorkCard key={item.id} item={item} eager={index < 3} />
              ))}
            </div>
          )}
          <Pagination
            path="/works"
            params={sp}
            page={filters.page}
            hasNext={filters.page < lastPage}
          />
        </div>
      </div>
    </div>
  );
}

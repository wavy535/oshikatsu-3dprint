import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { listFilterTags, listWorks } from "@/lib/works/queries";
import { PAGE_SIZE, SORTS, type Sort } from "@/lib/works/list-options";
import { buildWorksHref, parseWorkFilters, type RawSearchParams } from "@/lib/works/search-params";
import { getShellContext } from "@/lib/layout/queries";
import { WorkCard } from "@/components/work/work-card";
import { WorkFilterSidebar } from "@/components/work/work-filter-sidebar";
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
  const [{ items, total }, tags] = await Promise.all([listWorks(filters), listFilterTags()]);

  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const sortHrefs = Object.fromEntries(
    (Object.keys(SORTS) as Sort[]).map((s) => [s, buildWorksHref(sp, { sort: s })])
  ) as Record<Sort, string>;

  const usingNuiDefault = sp.nuiSize === undefined && shell.mainNui?.nui_size_cm;

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-6 py-6 lg:flex-row">
      <WorkFilterSidebar
        sp={sp}
        filters={filters}
        categories={tags.categories}
        worldviews={tags.worldviews}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-bold text-ink">
            {filters.q ? `「${filters.q}」の検索結果` : "作品をさがす"}
          </h1>
          <span className="num text-[12px] text-muted-foreground">{total}件</span>
          <div className="ml-auto">
            <WorkSortSelect value={filters.sort} hrefFor={sortHrefs} />
          </div>
        </div>

        {usingNuiDefault ? (
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-accent-foreground">
            {shell.mainNui?.name}（{filters.nuiSizeCm}cm）に対応する作品だけを出しています。
            <Link href={buildWorksHref(sp, { nuiSize: "" })} className="ml-2 underline">
              すべて見る
            </Link>
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
            <SearchX className="size-6 text-line" aria-hidden />
            <p className="text-sm font-semibold text-ink">条件に合う作品が見つかりませんでした</p>
            <p className="text-[12px] text-muted-foreground">
              絞り込みを外すか、別のキーワードでさがしてみてください。
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item, index) => (
              <WorkCard key={item.id} item={item} eager={index < 4} />
            ))}
          </div>
        )}

        <Pagination path="/works" params={sp} page={filters.page} hasNext={filters.page < lastPage} />
      </div>
    </div>
  );
}

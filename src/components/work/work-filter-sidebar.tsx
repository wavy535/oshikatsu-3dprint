import Link from "next/link";
import { Check, SlidersHorizontal } from "lucide-react";
import { ResponsiveSidebar } from "@/components/layout/responsive-sidebar";
import {
  buildWorksHref,
  type RawSearchParams,
} from "@/lib/works/search-params";
import type { WorkFilters } from "@/lib/works/list-options";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; slug: string };

function Choice({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-between gap-1 rounded-lg border px-3 py-2 text-sm",
        active
          ? "border-brand bg-brand-soft font-semibold text-brand"
          : "border-line bg-white text-ink hover:border-brand",
      )}
    >
      {label}
      {active && <Check className="size-3.5 shrink-0" aria-hidden />}
    </Link>
  );
}

export function WorkFilterSidebar({
  sp,
  filters,
  categories,
  worldviews,
}: {
  sp: RawSearchParams;
  filters: WorkFilters;
  categories: Tag[];
  worldviews: Tag[];
}) {
  return (
    <ResponsiveSidebar label="作品を絞り込む">
      <aside
        aria-label="絞り込み条件"
        className="flex w-full flex-col gap-6 rounded-2xl bg-white p-4 lg:border lg:border-line lg:p-5"
      >
        <div className="hidden items-center gap-2 text-base font-semibold lg:flex">
          <SlidersHorizontal className="size-4 text-brand" aria-hidden />
          絞り込み
        </div>
        <section aria-label="ぬいのサイズ">
          <h2 className="mb-3 text-sm font-semibold">ぬいのサイズ</h2>
          <div className="grid grid-cols-2 gap-2">
            <Choice
              href={buildWorksHref(sp, { nuiSize: "" })}
              label="すべて"
              active={!filters.nuiSizeCm}
            />
            {[10, 15, 20].map((cm) => (
              <Choice
                key={cm}
                href={buildWorksHref(sp, { nuiSize: cm })}
                label={`${cm}cm`}
                active={filters.nuiSizeCm === cm}
              />
            ))}
          </div>
        </section>
        <section aria-label="カテゴリ">
          <h2 className="mb-3 text-sm font-semibold">カテゴリ</h2>
          <div className="grid grid-cols-2 gap-2">
            <Choice
              href={buildWorksHref(sp, { category: undefined })}
              label="すべて"
              active={!filters.category}
            />
            {categories.map((tag) => (
              <Choice
                key={tag.id}
                href={buildWorksHref(sp, { category: tag.slug })}
                label={tag.name}
                active={filters.category === tag.slug}
              />
            ))}
          </div>
        </section>
        <details
          open={Boolean(filters.worldview)}
          className="border-t border-line pt-2"
        >
          <summary className="cursor-pointer py-3 text-sm font-semibold">
            世界観
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Choice
              href={buildWorksHref(sp, { worldview: undefined })}
              label="すべて"
              active={!filters.worldview}
            />
            {worldviews.map((tag) => (
              <Choice
                key={tag.id}
                href={buildWorksHref(sp, { worldview: tag.slug })}
                label={tag.name}
                active={filters.worldview === tag.slug}
              />
            ))}
          </div>
        </details>
        <details
          open={
            filters.priceMin !== undefined || filters.priceMax !== undefined
          }
          className="-mt-4 border-t border-line pt-2"
        >
          <summary className="cursor-pointer py-3 text-sm font-semibold">
            価格帯
          </summary>
          <div className="flex flex-col gap-2 pt-1">
            {[
              { label: "すべて", min: undefined, max: undefined },
              { label: "〜¥1,500", min: undefined, max: 1500 },
              { label: "¥1,500〜¥3,000", min: 1500, max: 3000 },
              { label: "¥3,000〜", min: 3000, max: undefined },
            ].map((band) => (
              <Choice
                key={band.label}
                href={buildWorksHref(sp, {
                  priceMin: band.min,
                  priceMax: band.max,
                })}
                label={band.label}
                active={
                  filters.priceMin === band.min && filters.priceMax === band.max
                }
              />
            ))}
          </div>
        </details>
        <Link
          href="/works?nuiSize="
          className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm text-muted-foreground hover:bg-ground"
        >
          条件をすべてクリア
        </Link>
      </aside>
    </ResponsiveSidebar>
  );
}

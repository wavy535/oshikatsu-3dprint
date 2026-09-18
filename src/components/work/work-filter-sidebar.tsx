import Link from "next/link";
import { ResponsiveSidebar } from "@/components/layout/responsive-sidebar";
import { buildWorksHref, type RawSearchParams } from "@/lib/works/search-params";
import type { WorkFilters } from "@/lib/works/list-options";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; slug: string };

const NUI_SIZES = [10, 15, 20];
const PRICE_BANDS = [
  { label: "〜¥1,500", max: 1500 },
  { label: "¥1,500〜¥3,000", min: 1500, max: 3000 },
  { label: "¥3,000〜", min: 3000 },
];

function Row({
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
      className={cn(
        "flex min-h-11 items-center rounded-lg px-2.5 py-1.5 lg:min-h-0 text-[12.5px] transition-colors",
        active ? "bg-brand-soft font-semibold text-accent-foreground" : "text-ink hover:bg-ground"
      )}
    >
      {label}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 py-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * 検索結果の左サイドバー（Figma「検索結果 46:1290」）。
 * 状態はURLのクエリだけが持つ。押すたびに1ページ目へ戻す。
 */
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
      <aside className="flex w-full shrink-0 flex-col gap-4 rounded-xl border-0 border-line bg-white p-3 lg:w-56 lg:border">
        <Group label="カテゴリ">
          <Row
            href={buildWorksHref(sp, { category: undefined })}
            label="すべて"
            active={!filters.category}
          />
          {categories.map((t) => (
            <Row
              key={t.id}
              href={buildWorksHref(sp, { category: t.slug })}
              label={t.name}
              active={filters.category === t.slug}
            />
          ))}
        </Group>

        <Group label="対応ぬいサイズ">
          <Row
            href={buildWorksHref(sp, { nuiSize: "" })}
            label="すべて"
            active={!filters.nuiSizeCm}
          />
          {NUI_SIZES.map((cm) => (
            <Row
              key={cm}
              href={buildWorksHref(sp, { nuiSize: cm })}
              label={`${cm}cm`}
              active={filters.nuiSizeCm === cm}
            />
          ))}
        </Group>

        <Group label="世界観">
          <Row
            href={buildWorksHref(sp, { worldview: undefined })}
            label="すべて"
            active={!filters.worldview}
          />
          {worldviews.map((t) => (
            <Row
              key={t.id}
              href={buildWorksHref(sp, { worldview: t.slug })}
              label={t.name}
              active={filters.worldview === t.slug}
            />
          ))}
        </Group>

        <Group label="価格帯">
          <Row
            href={buildWorksHref(sp, { priceMin: undefined, priceMax: undefined })}
            label="すべて"
            active={filters.priceMin === undefined && filters.priceMax === undefined}
          />
          {PRICE_BANDS.map((b) => (
            <Row
              key={b.label}
              href={buildWorksHref(sp, { priceMin: b.min, priceMax: b.max })}
              label={b.label}
              active={filters.priceMin === b.min && filters.priceMax === b.max}
            />
          ))}
        </Group>
      </aside>
    </ResponsiveSidebar>
  );
}

import type { ProductFilters } from "@/features/products/queries";

const SORT_VALUES = ["newest", "popular", "price_asc", "price_desc", "rating"] as const;

export type RawSearchParams = Record<string, string | undefined>;

function parseIntArray(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseSort(value: string | undefined): ProductFilters["sort"] {
  return (SORT_VALUES as readonly string[]).includes(value ?? "")
    ? (value as ProductFilters["sort"])
    : "newest";
}

/**
 * 一覧系（Top / 検索結果 / クリエイター公開ページ）で共通の URL クエリ解釈。
 * nuiSizes だけは「未指定ならマイぬいのサイズを既定にする」ため、
 * 呼び出し側から fallback を渡せるようにしてある。
 */
export function parseProductFilters(
  sp: RawSearchParams,
  fallbackNuiSizeIds: number[] = []
): ProductFilters {
  return {
    q: sp.q || undefined,
    categoryId: parseOptionalInt(sp.category),
    tagIds: parseIntArray(sp.tags),
    nuiSizeIds:
      sp.nuiSizes !== undefined ? parseIntArray(sp.nuiSizes) : fallbackNuiSizeIds,
    priceMin: parseOptionalInt(sp.priceMin),
    priceMax: parseOptionalInt(sp.priceMax),
    sort: parseSort(sp.sort),
    page: parseOptionalInt(sp.page) ?? 1,
  };
}

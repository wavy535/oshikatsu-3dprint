import type { Sort, WorkFilters } from "@/lib/works/list-options";
import { pageNumber } from "@/lib/pagination";

const SORT_VALUES: Sort[] = [
  "newest",
  "popular",
  "price_asc",
  "price_desc",
  "rating",
];

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | string[] | undefined) {
  const s = one(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 一覧系（Top / 検索結果 / クリエイターページ）で共通のクエリ解釈。
 * 対応ぬいサイズだけは「未指定ならメインのマイぬいのサイズを既定にする」ため、
 * 呼び出し側から fallback を渡せるようにしてある。
 */
export function parseWorkFilters(
  sp: RawSearchParams,
  fallbackNuiSizeCm?: number | null,
): WorkFilters {
  const sortRaw = one(sp.sort) as Sort | undefined;
  const size = one(sp.nuiSize);

  return {
    q: one(sp.q) || undefined,
    category: one(sp.category) || undefined,
    worldview: one(sp.worldview) || undefined,
    nuiSizeCm:
      size === undefined
        ? (fallbackNuiSizeCm ?? undefined)
        : size === ""
          ? undefined
          : Number(size),
    priceMin: int(sp.priceMin),
    priceMax: int(sp.priceMax),
    sort: sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : "newest",
    page: pageNumber(one(sp.page)),
  };
}

/** いまの絞り込みを保ったまま一部だけ差し替えたURLを作る */
export function buildWorksHref(
  sp: RawSearchParams,
  patch: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s) params.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  params.delete("page"); // 条件を変えたら1ページ目へ戻す
  const qs = params.toString();
  return qs ? `/works?${qs}` : "/works";
}

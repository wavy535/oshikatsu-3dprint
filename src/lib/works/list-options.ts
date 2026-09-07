/**
 * 一覧・検索の共有定義。
 *
 * queries.ts は "server-only" なので、並べ替えの選択肢のように
 * クライアント側からも参照するものはここに置く。
 */

export const PAGE_SIZE = 24;

export const SORTS = {
  newest: "新着順",
  popular: "お気に入りが多い順",
  price_asc: "価格が安い順",
  price_desc: "価格が高い順",
  rating: "評価が高い順",
} as const;
export type Sort = keyof typeof SORTS;

export type WorkFilters = {
  q?: string;
  /** tags.slug（type='category'） */
  category?: string;
  /** tags.slug（type='worldview'） */
  worldview?: string;
  /** 対応ぬいサイズ。10 / 15 / 20 */
  nuiSizeCm?: number;
  priceMin?: number;
  priceMax?: number;
  /** 公開プロフィールの作品一覧で、そのクリエイターに絞る */
  creatorId?: string;
  sort: Sort;
  page: number;
};

export type WorkCardItem = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  favoriteCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** サイズ展開が2本以上あるか（価格を「〜」表記にする） */
  hasRange: boolean;
  isPriceDropped: boolean;
  hasStock: boolean;
  reviewCount: number;
  avgRating: number | null;
  imagePath: string | null;
};

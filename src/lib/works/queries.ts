import { cache } from "react";
import { pageNumber } from "@/lib/pagination";
import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult, pageResult, readPage } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import "server-only";
import { getDatabase } from "@/lib/auth/guards";
import {
  PAGE_SIZE,
  type Sort,
  type WorkCardItem,
  type WorkFilters,
} from "@/lib/works/list-options";

export type { Sort, WorkCardItem, WorkFilters };
export { PAGE_SIZE };

/** 検索条件はDBで評価し、ページ内の作品・画像・価格帯だけを取得する。 */
export async function listWorks(filters: WorkFilters) {
  const db = await getDatabase();
  let query = db
    .selectFrom("work_list_items")
    .selectAll("work_list_items")
    .select((eb) => [
      eb
        .selectFrom("work_images")
        .select("storage_path")
        .whereRef("work_images.work_id", "=", "work_list_items.id")
        .orderBy("sort_order", "asc")
        .orderBy("id", "asc")
        .limit(1)
        .as("image_path"),
      jsonObjectFrom(
        eb
          .selectFrom("work_variant_pricing")
          .select((eb) => [
            eb.fn.min<number | null>("buyer_total_jpy").as("min"),
            eb.fn.max<number | null>("buyer_total_jpy").as("max"),
          ])
          .whereRef("work_variant_pricing.work_id", "=", "work_list_items.id")
          .where("is_listed", "=", true),
      )
        .$notNull()
        .as("price_range"),
    ])
    .where("work_list_items.status", "=", "published")
    .where("work_list_items.is_available", "=", true);

  for (const [type, slug] of [
    ["category", filters.category],
    ["worldview", filters.worldview],
  ] as const) {
    if (!slug) continue;
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("work_tags")
          .innerJoin("tags", "tags.id", "work_tags.tag_id")
          .select("work_tags.work_id")
          .whereRef("work_tags.work_id", "=", "work_list_items.id")
          .where("tags.type", "=", type)
          .where("tags.slug", "=", slug),
      ),
    );
  }
  const nuiSizeCm = filters.nuiSizeCm;
  if (nuiSizeCm) {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("work_variants")
          .select("work_id")
          .whereRef("work_variants.work_id", "=", "work_list_items.id")
          .where("is_listed", "=", true)
          .where("nui_size_cm", "=", nuiSizeCm),
      ),
    );
  }
  if (filters.q)
    query = query.where("work_list_items.title", "ilike", `%${filters.q}%`);
  if (filters.creatorId)
    query = query.where("work_list_items.creator_id", "=", filters.creatorId);
  // 価格帯の絞り込みも、画面に出している「支払額」で行う
  if (filters.priceMin !== undefined)
    query = query.where(
      "work_list_items.min_buyer_total_jpy",
      ">=",
      filters.priceMin,
    );
  if (filters.priceMax !== undefined)
    query = query.where(
      "work_list_items.min_buyer_total_jpy",
      "<=",
      filters.priceMax,
    );

  switch (filters.sort) {
    case "popular":
      query = query.orderBy("work_list_items.favorite_count", "desc");
      break;
    case "price_asc":
      query = query.orderBy("work_list_items.min_buyer_total_jpy", (order) =>
        order.asc().nullsLast(),
      );
      break;
    case "price_desc":
      query = query.orderBy("work_list_items.min_buyer_total_jpy", (order) =>
        order.desc().nullsLast(),
      );
      break;
    case "rating":
      query = query.orderBy("work_list_items.avg_rating", (order) =>
        order.desc().nullsLast(),
      );
      break;
    default:
      query = query.orderBy("work_list_items.created_at", "desc");
  }
  query = query.orderBy("work_list_items.id", "asc"); // 同値のときの並びを固定する

  const from = (pageNumber(filters.page) - 1) * PAGE_SIZE;
  const {
    data: rows,
    count,
    error,
  } = await pageResult(query, from, from + PAGE_SIZE - 1);
  if (error) throw new Error("作品を検索できませんでした", { cause: error });
  const items: WorkCardItem[] = (rows ?? []).map((r) => ({
    id: r.id!,
    title: r.title!,
    creatorId: r.creator_id!,
    creatorName: r.creator_name!,
    favoriteCount: r.favorite_count ?? 0,
    minPrice: r.price_range.min ?? r.min_buyer_total_jpy,
    maxPrice: r.price_range.max,
    hasRange: r.price_range.min !== r.price_range.max,
    isPriceDropped: Boolean(r.is_price_dropped),
    hasStock: Boolean(r.has_stock),
    reviewCount: r.review_count ?? 0,
    avgRating: r.avg_rating,
    imagePath: r.image_path,
  }));
  return { items, total: count ?? 0 };
}

/** 絞り込みサイドバーが出すタグの一覧 */
export async function listFilterTags() {
  const db = await getDatabase();
  const { data } = await queryResult(
    db
      .selectFrom("tags")
      .select([
        "tags.id",
        "tags.type",
        "tags.name",
        "tags.slug",
        "tags.sort_order",
      ])
      .orderBy("tags.sort_order", "asc")
      .execute(),
  );

  const all = data ?? [];
  return {
    categories: all.filter((t) => t.type === "category"),
    worldviews: all.filter((t) => t.type === "worldview"),
  };
}

/** 作品詳細。サイズ展開・画像・タグ・クリエイターまで1回で引く。 */
export const getWork = cache(async (id: string) => {
  const db = await getDatabase();
  const { data, error } = await queryResult(
    db
      .selectFrom("works")
      .select((eb) => [
        "works.id",
        "works.title",
        "works.description",
        "works.status",
        "works.creator_id",
        "works.favorite_count",
        "works.accepts_color_change",
        "works.accepts_mirror",
        "works.accepts_stand_hole",
        "works.accepts_custom_size",
        "works.accepts_other_request",
        "works.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r1")
            .select(["r1.display_name", "r1.avatar_url", "r1.bio"])
            .whereRef("r1.id", "=", "works.creator_id"),
        ).as("profiles"),
        jsonArrayFrom(
          eb
            .selectFrom("work_images as r2")
            .select(["r2.id", "r2.storage_path", "r2.sort_order"])
            .whereRef("r2.work_id", "=", "works.id"),
        ).as("work_images"),
        jsonArrayFrom(
          eb
            .selectFrom("work_tags as r3")
            .select((eb) => [
              jsonObjectFrom(
                eb
                  .selectFrom("tags as r4")
                  .select(["r4.id", "r4.name", "r4.slug", "r4.type"])
                  .whereRef("r4.id", "=", "r3.tag_id"),
              ).as("tags"),
            ])
            .whereRef("r3.work_id", "=", "works.id"),
        ).as("work_tags"),
        jsonArrayFrom(
          eb
            .selectFrom("work_variants as r5")
            .leftJoin("work_variant_pricing as pricing", "pricing.id", "r5.id")
            .select([
              "r5.id",
              "pricing.buyer_total_jpy",
              "r5.size_label",
              "r5.nui_size_cm",
              "r5.scale_ratio",
              "r5.is_base",
              "r5.price_jpy",
              "r5.stock",
              "r5.is_listed",
              "r5.is_printable",
              "r5.unprintable_reason",
              "r5.print_fee_jpy",
              "r5.est_print_hours",
              "r5.part_count",
              "r5.fit_width_mm",
              "r5.fit_height_mm",
              "r5.fit_depth_mm",
              "r5.bbox_x_mm",
              "r5.bbox_y_mm",
              "r5.bbox_z_mm",
            ])
            .whereRef("r5.work_id", "=", "works.id"),
        ).as("work_variants"),
      ])
      .where("works.id", "=", id)
      .executeTakeFirst(),
  );

  if (error) throw error;
  if (!data) return null;

  const variants = [...(data.work_variants ?? [])]
    .filter((v) => v.is_listed)
    .sort((a, b) => (a.nui_size_cm ?? 0) - (b.nui_size_cm ?? 0));

  const images = [...(data.work_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  return { ...data, work_variants: variants, work_images: images };
});

/**
 * レビューの件数・平均と、直近3件。作品詳細の1行サマリに使う。
 * 件数と平均は全件から出すので、直近3件とは別に集計を引く。
 */
const getWorkReviewStats = cache(async (workId: string) => {
  const db = await getDatabase();
  return db
    .selectFrom("reviews")
    .where("work_id", "=", workId)
    .select((eb) => [
      eb.fn.countAll<number>().as("count"),
      eb.fn.avg<number | null>("rating").as("avg"),
      eb.fn.avg<number | null>("design_rating").as("avgDesign"),
      eb.fn.avg<number | null>("accuracy_rating").as("avgAccuracy"),
      eb.fn.avg<number | null>("size_fit_rating").as("avgSizeFit"),
      eb.fn.countAll<number>().filterWhere("rating", "=", 5).as("stars5"),
      eb.fn.countAll<number>().filterWhere("rating", "=", 4).as("stars4"),
      eb.fn.countAll<number>().filterWhere("rating", "=", 3).as("stars3"),
      eb.fn.countAll<number>().filterWhere("rating", "=", 2).as("stars2"),
      eb.fn.countAll<number>().filterWhere("rating", "=", 1).as("stars1"),
    ])
    .executeTakeFirstOrThrow();
});

export async function getWorkReviewSummary(workId: string) {
  const db = await getDatabase();
  const [stats, latest] = await Promise.all([
    getWorkReviewStats(workId),
    db
      .selectFrom("reviews")
      .select(["rating", "comment", "created_at"])
      .where("work_id", "=", workId)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(3)
      .execute(),
  ]);
  return { count: stats.count, avg: stats.avg, latest };
}

/**
 * マイぬいと作品の相性。判定はDBの nui_fit_axes / nui_fit_verdict に任せる
 * （見た目ではなく採寸値で判定する、という設計判断のため）。
 */
export async function getNuiFit(variantId: string, nuiId: string) {
  const db = await getDatabase();
  const [axesRes, verdictRes] = await Promise.all([
    call(db, "nui_fit_axes", { p_variant_id: variantId, p_nui_id: nuiId }),
    call(db, "nui_fit_verdict", { p_variant_id: variantId, p_nui_id: nuiId }),
  ]);
  if (!axesRes.data) return null;
  return { axes: axesRes.data, verdict: verdictRes.data };
}

/** ログイン中のユーザーがこの作品をお気に入りに入れているか */
export async function isFavorited(workId: string, userId: string) {
  const db = await getDatabase();
  const { data } = await queryResult(
    db
      .selectFrom("work_favorites")
      .select(["work_favorites.work_id"])
      .where("work_favorites.work_id", "=", workId)
      .where("work_favorites.user_id", "=", userId)
      .executeTakeFirst(),
  );
  return Boolean(data);
}

/**
 * 作品のレビュー一覧と集計（分布・クリエイター向け3軸）。
 * 印刷品質・梱包・配送は運営あての評価なので、ここでは出さない（設計判断8）。
 */
export async function listWorkReviews(workId: string, requestedPage?: unknown) {
  const db = await getDatabase();
  const [page, stats] = await Promise.all([
    readPage(
      db
        .selectFrom("reviews")
        .select((eb) => [
          "reviews.id",
          "reviews.rating",
          "reviews.comment",
          "reviews.created_at",
          "reviews.is_anonymous",
          "reviews.design_rating",
          "reviews.accuracy_rating",
          "reviews.size_fit_rating",
          "reviews.photo_storage_path",
          jsonObjectFrom(
            eb
              .selectFrom("profiles as r6")
              .select(["r6.display_name", "r6.avatar_url"])
              .whereRef("r6.id", "=", "reviews.reviewer_id"),
          ).as("profiles"),
          jsonObjectFrom(
            eb
              .selectFrom("order_items as r7")
              .select(["r7.size_label_snapshot"])
              .whereRef("r7.id", "=", "reviews.order_item_id"),
          ).as("order_items"),
        ])
        .where("reviews.work_id", "=", workId)
        .orderBy("reviews.created_at", "desc")
        .orderBy("reviews.id", "desc"),
      requestedPage,
    ),
    getWorkReviewStats(workId),
  ]);
  const counts = [
    stats.stars5,
    stats.stars4,
    stats.stars3,
    stats.stars2,
    stats.stars1,
  ];
  return {
    ...page,
    rows: page.items,
    ...stats,
    distribution: counts.map((count, index) => ({ star: 5 - index, count })),
  };
}

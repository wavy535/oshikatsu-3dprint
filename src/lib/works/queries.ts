import { jsonObjectFrom, jsonArrayFrom } from "kysely/helpers/postgres";
import { queryResult, pageResult } from "@/lib/db/result";
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

  const from = (filters.page - 1) * PAGE_SIZE;
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
export async function getWork(id: string) {
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
            .select([
              "r5.id",
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

  if (error || !data) return null;

  // 支払額（作品価格＋印刷代行費）はビューが計算している
  const { data: pricing } = await queryResult(
    db
      .selectFrom("work_variant_pricing")
      .select([
        "work_variant_pricing.id",
        "work_variant_pricing.buyer_total_jpy",
      ])
      .where("work_variant_pricing.work_id", "=", id)
      .execute(),
  );
  const buyerTotalById = new Map(
    (pricing ?? []).map((p) => [p.id, p.buyer_total_jpy] as const),
  );

  const variants = [...(data.work_variants ?? [])]
    .filter((v) => v.is_listed)
    .map((v) => ({ ...v, buyer_total_jpy: buyerTotalById.get(v.id) ?? null }))
    .sort((a, b) => (a.nui_size_cm ?? 0) - (b.nui_size_cm ?? 0));

  const images = [...(data.work_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  return { ...data, work_variants: variants, work_images: images };
}

/**
 * レビューの件数・平均と、直近3件。作品詳細の1行サマリに使う。
 * 件数と平均は全件から出すので、直近3件とは別に集計を引く。
 */
export async function getWorkReviewSummary(workId: string) {
  const db = await getDatabase();
  const [allRes, latestRes] = await Promise.all([
    queryResult(
      db
        .selectFrom("reviews")
        .select(["reviews.rating"])
        .where("reviews.work_id", "=", workId)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("reviews")
        .select(["reviews.rating", "reviews.comment", "reviews.created_at"])
        .where("reviews.work_id", "=", workId)
        .orderBy("reviews.created_at", "desc")
        .limit(3)
        .execute(),
    ),
  ]);

  const all = allRes.data ?? [];
  const count = all.length;
  const avg = count ? all.reduce((n, r) => n + r.rating, 0) / count : null;
  return { count, avg, latest: latestRes.data ?? [] };
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
export async function listWorkReviews(workId: string) {
  const db = await getDatabase();
  const { data } = await queryResult(
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
      .execute(),
  );
  const rows = data ?? [];
  const count = rows.length;
  const avgOf = (pick: (r: (typeof rows)[number]) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rows.filter((r) => r.rating === star).length,
  }));
  return {
    rows,
    count,
    avg: avgOf((r) => r.rating),
    avgDesign: avgOf((r) => r.design_rating),
    avgAccuracy: avgOf((r) => r.accuracy_rating),
    avgSizeFit: avgOf((r) => r.size_fit_rating),
    distribution,
  };
}

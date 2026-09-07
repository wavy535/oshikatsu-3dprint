import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  type Sort,
  type WorkCardItem,
  type WorkFilters,
} from "@/lib/works/list-options";

export type { Sort, WorkCardItem, WorkFilters };
export { PAGE_SIZE };

/**
 * 一覧・検索結果の本体。
 *
 * 並べ替えのキーは work_list_items ビューが全部持っているので、絞り込みと
 * 並べ替えはビューへ投げる。ただしタグと対応ぬいサイズだけはビューに無いので、
 * 先に該当する作品IDを引いてから `in` で渡している。
 */
export async function listWorks(filters: WorkFilters) {
  const supabase = await createClient();

  // ── タグ・サイズの絞り込み。条件ごとに該当IDを集めて積集合をとる ──
  const idSets: string[][] = [];

  for (const slug of [filters.category, filters.worldview]) {
    if (!slug) continue;
    const { data } = await supabase
      .from("work_tags")
      .select("work_id, tags!inner(slug)")
      .eq("tags.slug", slug);
    idSets.push((data ?? []).map((r) => r.work_id));
  }

  if (filters.nuiSizeCm) {
    const { data } = await supabase
      .from("work_variants")
      .select("work_id")
      .eq("is_listed", true)
      .eq("nui_size_cm", filters.nuiSizeCm);
    idSets.push((data ?? []).map((r) => r.work_id));
  }

  const idFilter: string[] | null = idSets.length
    ? idSets.reduce((acc, ids) => acc.filter((id) => ids.includes(id)))
    : null;

  if (idFilter !== null && idFilter.length === 0) {
    return { items: [] as WorkCardItem[], total: 0 };
  }

  // ── 一覧本体 ──
  let query = supabase
    .from("work_list_items")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("is_available", true);

  if (idFilter !== null) query = query.in("id", idFilter);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.creatorId) query = query.eq("creator_id", filters.creatorId);
  // 価格帯の絞り込みも、画面に出している「支払額」で行う
  if (filters.priceMin !== undefined) query = query.gte("min_buyer_total_jpy", filters.priceMin);
  if (filters.priceMax !== undefined) query = query.lte("min_buyer_total_jpy", filters.priceMax);

  switch (filters.sort) {
    case "popular":
      query = query.order("favorite_count", { ascending: false });
      break;
    case "price_asc":
      query = query.order("min_buyer_total_jpy", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("min_buyer_total_jpy", { ascending: false, nullsFirst: false });
      break;
    case "rating":
      query = query.order("avg_rating", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  query = query.order("id", { ascending: true }); // 同値のときの並びを固定する

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data: rows, count } = await query.range(from, from + PAGE_SIZE - 1);
  const list = rows ?? [];
  if (list.length === 0) return { items: [] as WorkCardItem[], total: count ?? 0 };

  const ids = list.map((r) => r.id!).filter(Boolean) as string[];

  // ── カードに要る画像と価格帯をまとめて引く ──
  const [imagesRes, variantsRes] = await Promise.all([
    supabase
      .from("work_images")
      .select("work_id, storage_path, sort_order")
      .in("work_id", ids)
      .order("sort_order", { ascending: true }),
    // 価格は work_variant_pricing の buyer_total_jpy（作品価格＋印刷代行費）を使う。
    // 代行費は上乗せ請求（fee_billing = 'separate'）なので、price_jpy だけを出すと
    // 実際の支払額より安く見えてしまう
    supabase
      .from("work_variant_pricing")
      .select("work_id, buyer_total_jpy")
      .in("work_id", ids)
      .eq("is_listed", true),
  ]);

  const firstImage = new Map<string, string>();
  for (const img of imagesRes.data ?? []) {
    if (!firstImage.has(img.work_id)) firstImage.set(img.work_id, img.storage_path);
  }

  const prices = new Map<string, number[]>();
  for (const v of variantsRes.data ?? []) {
    if (v.buyer_total_jpy === null || v.work_id === null) continue;
    prices.set(v.work_id, [...(prices.get(v.work_id) ?? []), v.buyer_total_jpy]);
  }

  const items: WorkCardItem[] = list.map((r) => {
    const p = prices.get(r.id!) ?? [];
    return {
      id: r.id!,
      title: r.title!,
      creatorId: r.creator_id!,
      creatorName: r.creator_name!,
      favoriteCount: r.favorite_count ?? 0,
      minPrice: p.length ? Math.min(...p) : r.min_buyer_total_jpy,
      maxPrice: p.length ? Math.max(...p) : null,
      hasRange: p.length > 1 && Math.min(...p) !== Math.max(...p),
      isPriceDropped: Boolean(r.is_price_dropped),
      hasStock: Boolean(r.has_stock),
      reviewCount: r.review_count ?? 0,
      avgRating: r.avg_rating,
      imagePath: firstImage.get(r.id!) ?? null,
    };
  });

  return { items, total: count ?? items.length };
}

/** 絞り込みサイドバーが出すタグの一覧 */
export async function listFilterTags() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tags")
    .select("id, type, name, slug, sort_order")
    .order("sort_order", { ascending: true });

  const all = data ?? [];
  return {
    categories: all.filter((t) => t.type === "category"),
    worldviews: all.filter((t) => t.type === "worldview"),
  };
}

/** 作品詳細。サイズ展開・画像・タグ・クリエイターまで1回で引く。 */
export async function getWork(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("works")
    .select(
      `id, title, description, status, creator_id, favorite_count,
       accepts_color_change, accepts_mirror, accepts_stand_hole,
       accepts_custom_size, accepts_other_request, created_at,
       profiles!works_creator_id_fkey(display_name, avatar_url, bio),
       work_images(id, storage_path, sort_order),
       work_tags(tags(id, name, slug, type)),
       work_variants(id, size_label, nui_size_cm, scale_ratio, is_base, price_jpy, stock,
                     is_listed, is_printable, unprintable_reason, print_fee_jpy,
                     est_print_hours, part_count,
                     fit_width_mm, fit_height_mm, fit_depth_mm,
                     bbox_x_mm, bbox_y_mm, bbox_z_mm)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  // 支払額（作品価格＋印刷代行費）はビューが計算している
  const { data: pricing } = await supabase
    .from("work_variant_pricing")
    .select("id, buyer_total_jpy")
    .eq("work_id", id);
  const buyerTotalById = new Map(
    (pricing ?? []).map((p) => [p.id, p.buyer_total_jpy] as const)
  );

  const variants = [...(data.work_variants ?? [])]
    .filter((v) => v.is_listed)
    .map((v) => ({ ...v, buyer_total_jpy: buyerTotalById.get(v.id) ?? null }))
    .sort((a, b) => (a.nui_size_cm ?? 0) - (b.nui_size_cm ?? 0));

  const images = [...(data.work_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return { ...data, work_variants: variants, work_images: images };
}

/**
 * レビューの件数・平均と、直近3件。作品詳細の1行サマリに使う。
 * 件数と平均は全件から出すので、直近3件とは別に集計を引く。
 */
export async function getWorkReviewSummary(workId: string) {
  const supabase = await createClient();
  const [allRes, latestRes] = await Promise.all([
    supabase.from("reviews").select("rating").eq("work_id", workId),
    supabase
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("work_id", workId)
      .order("created_at", { ascending: false })
      .limit(3),
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
  const supabase = await createClient();
  const [axesRes, verdictRes] = await Promise.all([
    supabase.rpc("nui_fit_axes", { p_variant_id: variantId, p_nui_id: nuiId }),
    supabase.rpc("nui_fit_verdict", { p_variant_id: variantId, p_nui_id: nuiId }),
  ]);
  if (!axesRes.data) return null;
  return { axes: axesRes.data, verdict: verdictRes.data };
}

/** ログイン中のユーザーがこの作品をお気に入りに入れているか */
export async function isFavorited(workId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_favorites")
    .select("work_id")
    .eq("work_id", workId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * 作品のレビュー一覧と集計（分布・クリエイター向け3軸）。
 * 印刷品質・梱包・配送は運営あての評価なので、ここでは出さない（設計判断8）。
 */
export async function listWorkReviews(workId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      `id, rating, comment, created_at, is_anonymous, design_rating, accuracy_rating, size_fit_rating,
       photo_storage_path, profiles!reviews_reviewer_id_fkey(display_name, avatar_url),
       order_items(size_label_snapshot)`
    )
    .eq("work_id", workId)
    .order("created_at", { ascending: false });
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

-- ============================================================
-- 0012: 作品検索 RPC
-- DESIGN.md §6.3.C の searchProducts フィルタ仕様（tagIds=AND,
-- nuiSizeIds/filamentIds=OR）を満たすには、多対多の中間テーブルを
-- 横断する集合演算が必要で、PostgREST の単純なクエリビルダでは
-- 表現できない（tagIds の AND 判定は特に）。そのため RPC 化する。
--
-- security invoker（既定）のため、products の RLS
-- （products_select_published / products_select_own）がそのまま
-- 適用される＝非公開作品が検索結果に漏れることはない。
-- ============================================================

create or replace function public.search_products(
  p_q text default null,
  p_category_id smallint default null,
  p_tag_ids integer[] default null,
  p_nui_size_ids smallint[] default null,
  p_filament_ids integer[] default null,
  p_price_min integer default null,
  p_price_max integer default null,
  p_creator_handle text default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_per_page integer default 24
) returns table (
  id uuid,
  slug text,
  title text,
  base_price integer,
  review_count integer,
  review_avg numeric,
  favorite_count integer,
  creator_id uuid,
  creator_handle text,
  creator_display_name text,
  image_url text,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with page_size as (
    select least(greatest(coalesce(p_per_page, 24), 1), 60) as n
  ),
  filtered as (
    select p.*
    from public.products p
    join public.profiles cp on cp.id = p.creator_id
    where
      (p_q is null or p.title ilike '%' || p_q || '%')
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_creator_handle is null or cp.handle = p_creator_handle)
      and (p_price_min is null or p.base_price >= p_price_min)
      and (p_price_max is null or p.base_price <= p_price_max)
      and (
        p_tag_ids is null or array_length(p_tag_ids, 1) is null
        or (
          select count(distinct pt.tag_id)
          from public.product_tags pt
          where pt.product_id = p.id and pt.tag_id = any(p_tag_ids)
        ) = array_length(p_tag_ids, 1)
      )
      and (
        p_nui_size_ids is null or array_length(p_nui_size_ids, 1) is null
        or exists (
          select 1 from public.product_nui_sizes pns
          where pns.product_id = p.id and pns.nui_size_id = any(p_nui_size_ids)
        )
      )
      and (
        p_filament_ids is null or array_length(p_filament_ids, 1) is null
        or exists (
          select 1 from public.product_filaments pf
          where pf.product_id = p.id and pf.filament_id = any(p_filament_ids)
        )
      )
  )
  select
    f.id, f.slug, f.title, f.base_price,
    f.review_count, f.review_avg, f.favorite_count,
    f.creator_id, cp.handle, cp.display_name,
    (
      select pi.image_url from public.product_images pi
      where pi.product_id = f.id order by pi.sort_order limit 1
    ) as image_url,
    count(*) over() as total_count
  from filtered f
  join public.profiles cp on cp.id = f.creator_id
  order by
    case when p_sort = 'price_asc' then f.base_price end asc nulls last,
    case when p_sort = 'price_desc' then f.base_price end desc nulls last,
    case when p_sort = 'popular' then f.favorite_count end desc nulls last,
    case when p_sort = 'rating' then f.review_avg end desc nulls last,
    f.created_at desc
  limit (select n from page_size)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * (select n from page_size);
$$;

-- =============================================================================
-- 0013_min_buyer_total.sql
--
-- 一覧に「買う人が払う額」を持たせる。
--
-- 背景：
--   print_pricing_rules.fee_billing は既定が 'separate'（印刷代行費は作品価格に
--   上乗せして請求する）。つまり買う人が払うのは price_jpy + print_fee_jpy で、
--   work_variant_pricing.buyer_total_jpy がその値になる。
--
--   ところが一覧・検索が読む works.min_price_jpy は price_jpy の最小値
--   （＝クリエイターの取り分側の価格）なので、そのままカードに出すと
--   実際の支払額より安く見える。値段の見え方が実際と違うのは避けたいので、
--   支払額側の最小値も列として持ち、同じトリガーで追随させる。
--
--   min_price_jpy は「値下げ通知」の基準として使われているのでそのまま残す。
-- =============================================================================

alter table public.works add column min_buyer_total_jpy integer;

comment on column public.works.min_buyer_total_jpy is
  '出品中サイズのうち、買う人が払う額（price_jpy + 代行費）の最小値。カードの表示と価格の並べ替えに使う。';

create or replace function public.sync_work_min_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.work_id, old.work_id);
  new_min integer;
  old_min integer;
  new_buyer_min integer;
begin
  select min(price_jpy) into new_min
    from public.work_variants
   where work_id = target and is_listed and price_jpy is not null;

  select min(buyer_total_jpy) into new_buyer_min
    from public.work_variant_pricing
   where work_id = target and is_listed and buyer_total_jpy is not null;

  select min_price_jpy into old_min from public.works where id = target;

  if new_min is distinct from old_min then
    update public.works
       set previous_min_price_jpy = old_min,
           min_price_jpy = new_min,
           min_buyer_total_jpy = new_buyer_min,
           price_changed_at = now()
     where id = target;
  else
    update public.works
       set min_buyer_total_jpy = new_buyer_min
     where id = target and min_buyer_total_jpy is distinct from new_buyer_min;
  end if;

  return null;
end;
$$;

-- 既存データを埋める
update public.works w
   set min_buyer_total_jpy = p.buyer_min
  from (
    select work_id, min(buyer_total_jpy) as buyer_min
      from public.work_variant_pricing
     where is_listed and buyer_total_jpy is not null
     group by work_id
  ) p
 where p.work_id = w.id;

-- 一覧のビューにも足す（列は末尾に追加する）
create or replace view public.work_list_items as
select
  w.id,
  w.creator_id,
  p.display_name as creator_name,
  w.title,
  w.status,
  w.favorite_count,
  w.min_price_jpy,
  w.previous_min_price_jpy,
  w.price_changed_at,
  (w.previous_min_price_jpy is not null
   and w.min_price_jpy is not null
   and w.min_price_jpy < w.previous_min_price_jpy
   and w.price_changed_at > now() - interval '7 days') as is_price_dropped,
  exists (
    select 1 from public.work_variants v
     where v.work_id = w.id and v.is_listed and v.is_printable
  ) as is_available,
  exists (
    select 1 from public.work_variants v
     where v.work_id = w.id and v.is_listed and coalesce(v.stock, 0) > 0
  ) as has_stock,
  coalesce(r.review_count, 0) as review_count,
  r.avg_rating,
  w.created_at,
  w.min_buyer_total_jpy
from public.works w
join public.profiles p on p.id = w.creator_id
left join (
  select work_id, count(*)::integer as review_count, round(avg(rating)::numeric, 1) as avg_rating
    from public.reviews group by work_id
) r on r.work_id = w.id;

alter view public.work_list_items set (security_invoker = on);

-- ============================================================
-- 0020: サイズ展開と印刷キューに合わせて注文まわりの RPC を更新
--   create_pending_order … 単価をサイズ展開から解決し、在庫を検証する
--   mark_order_paid      … 在庫を引き、明細ごとに印刷ジョブを積む
--   search_products      … サイズ展開の本数と価格上限を返す
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- create_pending_order
--   0013 版との違いは単価の出どころだけ:
--     旧 products.base_price + filaments.surcharge
--     新 resolve_unit_price(product, size) + filaments.surcharge
--   あわせて、取扱いのないサイズ・在庫切れをここで弾く。
-- ────────────────────────────────────────────────────────────
create or replace function public.create_pending_order(
  p_buyer_id uuid,
  p_address_id uuid,
  p_shipping_fee integer
) returns table(order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal integer;
  v_total integer;
  v_addr record;
  v_item record;
  v_short record;
begin
  if auth.uid() is not null and p_buyer_id <> auth.uid() then
    raise exception '権限がありません';
  end if;

  select * into v_addr from public.shipping_addresses
    where id = p_address_id and user_id = p_buyer_id and deleted_at is null;
  if not found then
    raise exception '配送先が見つかりません';
  end if;

  if not exists (select 1 from public.cart_items where user_id = p_buyer_id) then
    raise exception 'カートが空です';
  end if;

  if exists (
    select 1 from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = p_buyer_id and (p.status <> 'published' or p.deleted_at is not null)
  ) then
    raise exception '販売終了した作品がカートに含まれています';
  end if;

  -- 取扱いのないサイズ（is_active=false）が残っていないか
  select ns.label into v_short
  from public.cart_items ci
  join public.product_size_variants v
    on v.product_id = ci.product_id and v.nui_size_id = ci.nui_size_id
  join public.nui_sizes ns on ns.id = ci.nui_size_id
  where ci.user_id = p_buyer_id and not v.is_active
  limit 1;
  if found then
    raise exception '取扱いのないサイズがカートに含まれています: %', v_short.label;
  end if;

  -- 在庫不足（サイズ展開を持つ作品のみ検証する）
  select ns.label as label, v.stock as stock into v_short
  from public.cart_items ci
  join public.product_size_variants v
    on v.product_id = ci.product_id and v.nui_size_id = ci.nui_size_id
  join public.nui_sizes ns on ns.id = ci.nui_size_id
  where ci.user_id = p_buyer_id and v.stock < ci.quantity
  limit 1;
  if found then
    raise exception '在庫が足りません（% は残り %点）', v_short.label, v_short.stock;
  end if;

  select coalesce(sum((public.resolve_unit_price(ci.product_id, ci.nui_size_id) + f.surcharge) * ci.quantity), 0)
    into v_subtotal
  from public.cart_items ci
  join public.filaments f on f.id = ci.filament_id
  where ci.user_id = p_buyer_id;

  v_total := v_subtotal + p_shipping_fee;

  insert into public.orders (
    buyer_id, subtotal, shipping_fee, total,
    ship_recipient_name, ship_postal_code, ship_prefecture, ship_city,
    ship_address_line1, ship_address_line2, ship_phone
  ) values (
    p_buyer_id, v_subtotal, p_shipping_fee, v_total,
    v_addr.recipient_name, v_addr.postal_code, v_addr.prefecture, v_addr.city,
    v_addr.address_line1, v_addr.address_line2, v_addr.phone
  ) returning id into v_order_id;

  for v_item in
    select
      ci.product_id, ci.quantity, p.title as product_title, p.creator_id,
      (select pi.image_url from public.product_images pi
        where pi.product_id = p.id order by pi.sort_order limit 1) as image_url,
      ci.filament_id, f.name as filament_name, f.color_hex as filament_color_hex, f.surcharge,
      ci.nui_size_id, ns.label as nui_size_label,
      public.resolve_unit_price(ci.product_id, ci.nui_size_id) as unit_base_price,
      coalesce(cp.commission_rate, 0.300) as commission_rate
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.filaments f on f.id = ci.filament_id
    left join public.nui_sizes ns on ns.id = ci.nui_size_id
    left join public.creator_profiles cp on cp.user_id = p.creator_id
    where ci.user_id = p_buyer_id
  loop
    insert into public.order_items (
      order_id, product_id, creator_id,
      product_title, product_image_url,
      filament_id, filament_name, filament_color_hex,
      nui_size_id, nui_size_label,
      unit_price, quantity, line_total,
      commission_rate, creator_revenue
    ) values (
      v_order_id, v_item.product_id, v_item.creator_id,
      v_item.product_title, v_item.image_url,
      v_item.filament_id, v_item.filament_name, v_item.filament_color_hex,
      v_item.nui_size_id, v_item.nui_size_label,
      v_item.unit_base_price + v_item.surcharge, v_item.quantity,
      (v_item.unit_base_price + v_item.surcharge) * v_item.quantity,
      v_item.commission_rate,
      round((v_item.unit_base_price + v_item.surcharge) * v_item.quantity * (1 - v_item.commission_rate))
    );
  end loop;

  return query select v_order_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- mark_order_paid
--   0013 版に「在庫を引く」「印刷ジョブを積む」を足したもの。
--   決済確定と同じトランザクションで行うので、キューへの積み忘れが起きない。
-- ────────────────────────────────────────────────────────────
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_intent_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_creator_id uuid;
  v_due_at timestamptz := now() + interval '10 days';
begin
  select buyer_id into v_buyer_id
    from public.orders where id = p_order_id and status = 'pending_payment';
  if not found then
    return;
  end if;

  update public.orders set
    status = 'paid',
    paid_at = now(),
    stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id, reason)
  values (p_order_id, 'pending_payment', 'paid', null, 'stripe_webhook');

  -- 在庫を引く（サイズ展開を持つ明細のみ。0 を下回らないよう greatest で止める）
  update public.product_size_variants v
    set stock = greatest(v.stock - oi.quantity, 0)
  from public.order_items oi
  where oi.order_id = p_order_id
    and v.product_id = oi.product_id
    and v.nui_size_id = oi.nui_size_id;

  -- 印刷キューへ積む（Figma ④ 運営｜印刷キュー一覧）
  insert into public.print_jobs (
    order_item_id, order_id, product_id, creator_id, nui_size_id,
    due_at, est_weight_g, est_print_min, part_count
  )
  select
    oi.id, oi.order_id, oi.product_id, oi.creator_id, oi.nui_size_id,
    v_due_at,
    coalesce(v.est_weight_g, p.est_weight_g),
    coalesce(v.est_print_min, p.est_print_min),
    greatest(coalesce((select sum(pa.quantity_per_item) from public.product_assets pa
                        where pa.product_id = oi.product_id), 1), 1)
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  left join public.product_size_variants v
    on v.product_id = oi.product_id and v.nui_size_id = oi.nui_size_id
  where oi.order_id = p_order_id
  on conflict (order_item_id) do nothing;

  delete from public.cart_items where user_id = v_buyer_id;

  for v_creator_id in
    select distinct creator_id from public.order_items where order_id = p_order_id
  loop
    insert into public.message_threads (kind, buyer_id, creator_id, order_id)
    values ('order', v_buyer_id, v_creator_id, p_order_id)
    on conflict (order_id, creator_id) where order_id is not null do nothing;
  end loop;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- search_products : 戻り値にサイズ展開の情報を足す
--   variant_count … 取扱いのあるサイズ数（2 以上なら価格を「〜」表記にする）
--   max_price     … その最高値
-- 戻り値の型が変わるので drop してから作り直す。
-- ────────────────────────────────────────────────────────────
drop function if exists public.search_products(
  text, smallint, integer[], smallint[], integer[], integer, integer, text, text, integer, integer
);

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
  max_price integer,
  variant_count integer,
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
    coalesce((select max(v.price)::integer from public.product_size_variants v
               where v.product_id = f.id and v.is_active), f.base_price) as max_price,
    coalesce((select count(*)::integer from public.product_size_variants v
               where v.product_id = f.id and v.is_active), 0) as variant_count,
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

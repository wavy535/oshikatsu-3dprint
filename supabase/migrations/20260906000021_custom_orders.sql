-- ============================================================
-- 0021: オーダーメイド相談 → 見積り → 承認 → 決済
--
-- Figma ③やりとり・相談 の 2 画面:
--   オーダーメイド相談フォーム（48:900）… 希望を書いて送るとメッセージとして届く
--   見積り・お支払い（2096:1389）      … 承認すると通常の決済画面へ進む
--
-- 相談は必ず「元になる作品」に紐づく（作品詳細・クリエイターページが入口のため）。
-- 決済は通常注文と同じ orders / order_items に落とすので、
-- 決済後の印刷キュー・精算・レビューはすべて既存の流れに合流する。
-- ============================================================

create type custom_order_status as enum (
  'requested', 'quoted', 'approved', 'rejected', 'paid', 'cancelled'
);

create table public.custom_orders (
  id            uuid primary key default gen_random_uuid(),
  buyer_id      uuid not null references public.profiles(id) on delete cascade,
  creator_id    uuid not null references public.profiles(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete restrict,
  thread_id     uuid references public.message_threads(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,

  status        custom_order_status not null default 'requested',

  -- 相談内容（買う人が書く）
  nui_size_id   smallint references public.nui_sizes(id),
  color_note    text check (char_length(color_note) <= 500),
  finish_note   text check (char_length(finish_note) <= 500),
  request_note  text not null check (char_length(request_note) between 1 and 2000),
  desired_date  date,

  -- 見積り（クリエイターが返す）
  quote_price       integer check (quote_price between 100 and 500000),
  quote_filament_g  integer check (quote_filament_g >= 0),
  quote_print_min   integer check (quote_print_min >= 0),
  quote_part_count  integer check (quote_part_count > 0),
  quote_lead_days   integer check (quote_lead_days between 1 and 180),
  quote_spec        text check (char_length(quote_spec) <= 2000),
  quote_note        text check (char_length(quote_note) <= 2000),
  quoted_at         timestamptz,
  approved_at       timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 見積り済み以降は必ず金額が入っている
  constraint custom_orders_quote_present
    check (status not in ('quoted', 'approved', 'paid') or quote_price is not null)
);
create index on public.custom_orders (buyer_id, created_at desc);
create index on public.custom_orders (creator_id, status, created_at desc);
create trigger custom_orders_set_updated_at
  before update on public.custom_orders
  for each row execute function public.set_updated_at();

alter table public.custom_orders enable row level security;

create policy custom_orders_select_party on public.custom_orders
  for select using (
    buyer_id = auth.uid() or creator_id = auth.uid() or public.is_admin()
  );
-- 相談を始められるのは買う人だけ
create policy custom_orders_insert_buyer on public.custom_orders
  for insert with check (buyer_id = auth.uid());
-- 見積りの記入も承認もこのポリシーで通す（値の妥当性は Server Action 側で担保）
create policy custom_orders_update_party on public.custom_orders
  for update using (buyer_id = auth.uid() or creator_id = auth.uid())
       with check (buyer_id = auth.uid() or creator_id = auth.uid());
create policy custom_orders_admin_all on public.custom_orders
  for all using (public.is_admin()) with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 承認済みの見積りから注文を作る。
-- create_pending_order がカートを見るのに対し、こちらは見積り 1 件を
-- そのまま 1 明細の注文にする。以降（決済確定・印刷キュー・精算）は共通。
-- ────────────────────────────────────────────────────────────
create or replace function public.create_order_from_custom_order(
  p_custom_order_id uuid,
  p_address_id uuid,
  p_shipping_fee integer
) returns table(order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_co record;
  v_addr record;
  v_order_id uuid;
  v_commission numeric;
  v_filament record;
  v_image text;
begin
  select * into v_co from public.custom_orders where id = p_custom_order_id;
  if not found then
    raise exception '見積りが見つかりません';
  end if;
  if auth.uid() is not null and v_co.buyer_id <> auth.uid() then
    raise exception '権限がありません';
  end if;
  if v_co.status <> 'approved' then
    raise exception '承認済みの見積りのみ決済できます';
  end if;
  if v_co.order_id is not null then
    return query select v_co.order_id;
    return;
  end if;

  select * into v_addr from public.shipping_addresses
    where id = p_address_id and user_id = v_co.buyer_id and deleted_at is null;
  if not found then
    raise exception '配送先が見つかりません';
  end if;

  select coalesce(cp.commission_rate, 0.300) into v_commission
  from public.creator_profiles cp where cp.user_id = v_co.creator_id;
  v_commission := coalesce(v_commission, 0.300);

  -- 明細に載せる色は作品の既定フィラメント（相談時の希望は quote_spec に文章で残る）
  select f.* into v_filament
  from public.product_filaments pf
  join public.filaments f on f.id = pf.filament_id
  where pf.product_id = v_co.product_id
  order by pf.is_default desc
  limit 1;
  if not found then
    select * into v_filament from public.filaments where is_active order by sort_order limit 1;
  end if;
  if not found then
    raise exception 'フィラメントマスタが未設定です';
  end if;

  select pi.image_url into v_image from public.product_images pi
    where pi.product_id = v_co.product_id order by pi.sort_order limit 1;

  insert into public.orders (
    buyer_id, subtotal, shipping_fee, total,
    ship_recipient_name, ship_postal_code, ship_prefecture, ship_city,
    ship_address_line1, ship_address_line2, ship_phone
  ) values (
    v_co.buyer_id, v_co.quote_price, p_shipping_fee, v_co.quote_price + p_shipping_fee,
    v_addr.recipient_name, v_addr.postal_code, v_addr.prefecture, v_addr.city,
    v_addr.address_line1, v_addr.address_line2, v_addr.phone
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, creator_id,
    product_title, product_image_url,
    filament_id, filament_name, filament_color_hex,
    nui_size_id, nui_size_label,
    unit_price, quantity, line_total,
    commission_rate, creator_revenue
  )
  select
    v_order_id, v_co.product_id, v_co.creator_id,
    p.title || '（オーダーメイド）', v_image,
    v_filament.id, v_filament.name, v_filament.color_hex,
    v_co.nui_size_id, ns.label,
    v_co.quote_price, 1, v_co.quote_price,
    v_commission, round(v_co.quote_price * (1 - v_commission))
  from public.products p
  left join public.nui_sizes ns on ns.id = v_co.nui_size_id
  where p.id = v_co.product_id;

  update public.custom_orders
    set order_id = v_order_id
    where id = p_custom_order_id;

  return query select v_order_id;
end;
$$;

-- 決済確定時に、対応するオーダーメイド相談も paid にする
create or replace function public.sync_custom_order_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.custom_orders
      set status = 'paid'
      where order_id = new.id and status = 'approved';
  end if;
  return null;
end $$;

create trigger orders_sync_custom_order
  after update on public.orders
  for each row execute function public.sync_custom_order_on_paid();

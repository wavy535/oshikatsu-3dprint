-- ============================================================
-- 0004: カート・注文系テーブル
-- DESIGN.md §4.4.3 / §7.3 準拠
-- ============================================================

-- ─────────────────────────────────────────────
-- cart_items : ログインユーザーのカート（DB永続）
-- ─────────────────────────────────────────────
create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  filament_id integer not null references public.filaments(id),
  nui_size_id smallint references public.nui_sizes(id),
  quantity    smallint not null default 1 check (quantity between 1 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, product_id, filament_id, nui_size_id)
);
create index on public.cart_items (user_id);
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- orders : 注文ヘッダ
-- ─────────────────────────────────────────────
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,
  buyer_id          uuid not null references public.profiles(id) on delete restrict,
  status            order_status not null default 'pending_payment',

  subtotal          integer not null check (subtotal >= 0),
  shipping_fee      integer not null default 0 check (shipping_fee >= 0),
  discount          integer not null default 0 check (discount >= 0),
  total             integer not null check (total >= 0),

  ship_recipient_name text not null,
  ship_postal_code    text not null,
  ship_prefecture     text not null,
  ship_city           text not null,
  ship_address_line1  text not null,
  ship_address_line2  text,
  ship_phone          text not null,

  buyer_note        text check (char_length(buyer_note) <= 1000),
  admin_note        text,

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,

  paid_at           timestamptz,
  printing_at       timestamptz,
  shipped_at        timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  refunded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_total_matches
    check (total = subtotal + shipping_fee - discount),
  constraint orders_paid_has_timestamp
    check (status not in ('paid','printing','shipped','completed') or paid_at is not null)
);
create index on public.orders (buyer_id, created_at desc);
create index on public.orders (status, paid_at) where status in ('paid','printing');
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create sequence public.order_number_seq;

create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'OS-'
      || to_char(now() at time zone 'Asia/Tokyo', 'YYYYMMDD')
      || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0');
  end if;
  return new;
end $$;
create trigger orders_set_number
  before insert on public.orders
  for each row execute function public.set_order_number();

-- ─────────────────────────────────────────────
-- order_items : 注文明細 =「制作指示書」（スナップショット）
-- ─────────────────────────────────────────────
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete restrict,
  creator_id      uuid not null references public.profiles(id) on delete restrict,

  product_title   text not null,
  product_image_url text,
  filament_id     integer not null references public.filaments(id),
  filament_name   text not null,
  filament_color_hex text not null,
  nui_size_id     smallint references public.nui_sizes(id),
  nui_size_label  text,

  unit_price      integer not null check (unit_price >= 0),
  quantity        smallint not null check (quantity between 1 and 20),
  line_total      integer not null check (line_total >= 0),

  commission_rate numeric(4,3) not null,
  creator_revenue integer not null check (creator_revenue >= 0),

  item_status     item_status not null default 'pending',
  printed_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint order_items_line_total_matches
    check (line_total = unit_price * quantity)
);
create index on public.order_items (order_id);
create index on public.order_items (creator_id, created_at desc);
create index on public.order_items (product_id);
create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- order_events : ステータス変更の監査ログ
-- ─────────────────────────────────────────────
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  actor_id    uuid references public.profiles(id),
  reason      text,
  created_at  timestamptz not null default now()
);
create index on public.order_events (order_id, created_at);

-- ─────────────────────────────────────────────
-- shipments : 発送情報（分割発送に備え1:N）
-- ─────────────────────────────────────────────
create table public.shipments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  carrier       text not null check (carrier in ('yamato','sagawa','japanpost','other')),
  tracking_number text not null,
  tracking_url  text,
  shipped_at    timestamptz not null default now(),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (carrier, tracking_number)
);
create index on public.shipments (order_id);

-- ─────────────────────────────────────────────
-- stripe_events : Webhook 冪等化（DESIGN.md §7.3）
-- ─────────────────────────────────────────────
create table public.stripe_events (
  id         text primary key,
  type       text not null,
  created_at timestamptz not null default now()
);

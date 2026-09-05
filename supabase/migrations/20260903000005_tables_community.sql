-- ============================================================
-- 0005: コーデ・レビュー・メッセージ系テーブル
-- DESIGN.md §4.4.4 / §4.4.5 / §4.4.6 準拠
-- ============================================================

-- ─────────────────────────────────────────────
-- coordinates : 推し空間 / コーデ写真投稿
-- ─────────────────────────────────────────────
create table public.coordinates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 60),
  body         text check (char_length(body) <= 2000),
  cover_image_url text not null,
  user_nui_id  uuid references public.user_nuis(id) on delete set null,
  nui_size_id  smallint references public.nui_sizes(id),
  is_public    boolean not null default true,
  like_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on public.coordinates (is_public, created_at desc) where deleted_at is null;
create index on public.coordinates (user_id) where deleted_at is null;
create trigger coordinates_set_updated_at
  before update on public.coordinates
  for each row execute function public.set_updated_at();

create table public.coordinate_images (
  id            uuid primary key default gen_random_uuid(),
  coordinate_id uuid not null references public.coordinates(id) on delete cascade,
  image_url     text not null,
  sort_order    smallint not null default 0
);

-- ─────────────────────────────────────────────
-- coordinate_items : 使用作品の紐付け（写真上の座標も持てる）
-- ─────────────────────────────────────────────
create table public.coordinate_items (
  id            uuid primary key default gen_random_uuid(),
  coordinate_id uuid not null references public.coordinates(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  pin_x         numeric(4,3) check (pin_x between 0 and 1),
  pin_y         numeric(4,3) check (pin_y between 0 and 1),
  note          text check (char_length(note) <= 200),
  sort_order    smallint not null default 0,
  unique (coordinate_id, product_id)
);
create index on public.coordinate_items (product_id);

create table public.coordinate_likes (
  coordinate_id uuid not null references public.coordinates(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (coordinate_id, user_id)
);

-- ─────────────────────────────────────────────
-- reviews
-- ─────────────────────────────────────────────
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  title         text check (char_length(title) <= 60),
  body          text check (char_length(body) <= 2000),
  is_public     boolean not null default true,
  creator_reply text check (char_length(creator_reply) <= 1000),
  creator_replied_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.reviews (product_id, created_at desc) where deleted_at is null;
create index on public.reviews (user_id);
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.review_images (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews(id) on delete cascade,
  image_url   text not null,
  sort_order  smallint not null default 0
);

-- レビュー集計トリガ（products.review_count / review_avg キャッシュ更新）
create or replace function public.refresh_product_review_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  update public.products p set
    review_count = s.cnt,
    review_avg   = coalesce(s.avg, 0)
  from (
    select count(*) cnt, avg(rating)::numeric(3,2) avg
    from public.reviews
    where product_id = pid and deleted_at is null and is_public
  ) s
  where p.id = pid;
  return null;
end $$;

create trigger reviews_stats
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_review_stats();

-- ─────────────────────────────────────────────
-- message_threads : 1スレッド = (購入者, クリエイター) [+ 作品/注文]
--
-- ★DESIGN.md からの補正: §4.4.6 は「注文ごとに1本」とコメントしていたが
--   §6.3.H は「クリエイターごとに1本作成」と定義しており、§12.1 #4 で
--   複数クリエイター混在注文を許可している設計と矛盾していた。
--   実装では意図どおり「(order_id, creator_id) の組で1本」とし、
--   1注文に複数クリエイターがいれば購入者はクリエイターごとに別スレッドで
--   やり取りできるようにする。
-- ─────────────────────────────────────────────
create table public.message_threads (
  id          uuid primary key default gen_random_uuid(),
  kind        thread_kind not null,
  buyer_id    uuid not null references public.profiles(id) on delete cascade,
  creator_id  uuid not null references public.profiles(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  order_id    uuid references public.orders(id) on delete set null,
  subject     text check (char_length(subject) <= 100),
  last_message_at timestamptz not null default now(),
  buyer_unread_count   integer not null default 0,
  creator_unread_count integer not null default 0,
  is_closed   boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint threads_order_required_for_order_kind
    check (kind <> 'order' or order_id is not null),
  constraint threads_no_self_message
    check (buyer_id <> creator_id)
);
create index on public.message_threads (buyer_id, last_message_at desc);
create index on public.message_threads (creator_id, last_message_at desc);
create unique index message_threads_unique_order_creator
  on public.message_threads (order_id, creator_id) where order_id is not null;

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.message_threads(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  attachment_url text,
  is_admin_note boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on public.messages (thread_id, created_at);

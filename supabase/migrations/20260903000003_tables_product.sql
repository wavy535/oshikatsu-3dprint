-- ============================================================
-- 0003: 作品系テーブル
-- DESIGN.md §4.4.2 / §5.2 準拠
-- ============================================================

-- ─────────────────────────────────────────────
-- categories / tags / filaments : マスタ
-- ─────────────────────────────────────────────
create table public.categories (
  id          smallint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  parent_id   smallint references public.categories(id),
  sort_order  smallint not null default 0,
  is_active   boolean not null default true
);

create table public.tags (
  id          integer generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  kind        text not null default 'worldview'
                check (kind in ('worldview','event','color','other')),
  is_active   boolean not null default true
);

create table public.filaments (
  id          integer generated always as identity primary key,
  code        text not null unique,
  name        text not null,
  material    text not null,
  color_name  text not null,
  color_hex   text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  finish      filament_finish not null default 'matte',
  surcharge   integer not null default 0 check (surcharge >= 0),
  swatch_url  text,
  is_active   boolean not null default true,
  sort_order  smallint not null default 0
);

-- ─────────────────────────────────────────────
-- products : 作品
-- ─────────────────────────────────────────────
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.profiles(id) on delete restrict,
  slug           text not null unique check (slug ~ '^[a-z0-9\-]{3,60}$'),
  title          text not null check (char_length(title) between 1 and 80),
  description    text not null check (char_length(description) <= 5000),
  category_id    smallint not null references public.categories(id),
  status         product_status not null default 'draft',

  base_price     integer not null check (base_price between 100 and 500000),

  size_w_mm      integer check (size_w_mm > 0),
  size_d_mm      integer check (size_d_mm > 0),
  size_h_mm      integer check (size_h_mm > 0),
  est_weight_g   integer check (est_weight_g > 0),
  est_print_min  integer check (est_print_min > 0),
  print_note     text check (char_length(print_note) <= 2000),

  max_concurrent_orders integer check (max_concurrent_orders > 0),

  review_count   integer not null default 0,
  review_avg     numeric(3,2) not null default 0,
  sold_count     integer not null default 0,
  favorite_count integer not null default 0,

  published_at   timestamptz,
  rejected_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint products_published_consistency
    check (status <> 'published' or published_at is not null)
);
create index on public.products (status, published_at desc) where deleted_at is null;
create index on public.products (creator_id) where deleted_at is null;
create index on public.products (category_id) where deleted_at is null;
create index products_title_trgm on public.products using gin (title gin_trgm_ops);
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- product_assets : STL 等の制作データ（★非公開）
-- ─────────────────────────────────────────────
create table public.product_assets (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  storage_path  text not null unique,
  original_name text not null,
  file_ext      text not null check (file_ext in ('stl','3mf','obj','step')),
  file_size     bigint not null check (file_size between 1 and 209715200),
  checksum_sha256 text,
  part_label    text,
  quantity_per_item smallint not null default 1 check (quantity_per_item > 0),
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index on public.product_assets (product_id);
comment on table public.product_assets is
  'STL 実体は private バケット。参照権は creator(自分の作品のみ) と admin のみ。buyer は一切参照不可';

-- 署名URL発行のたびに記録する監査ログ（DESIGN.md §5.2）
create table public.asset_access_logs (
  id         bigint generated always as identity primary key,
  asset_id   uuid not null references public.product_assets(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  action     text not null check (action in ('download','view')),
  created_at timestamptz not null default now()
);
create index on public.asset_access_logs (asset_id, created_at desc);
create index on public.asset_access_logs (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- product_images : 公開画像
-- ─────────────────────────────────────────────
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  image_url   text not null,
  alt         text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.product_images (product_id, sort_order);

-- ─────────────────────────────────────────────
-- 中間テーブル群
-- ─────────────────────────────────────────────
create table public.product_nui_sizes (
  product_id  uuid not null references public.products(id) on delete cascade,
  nui_size_id smallint not null references public.nui_sizes(id),
  primary key (product_id, nui_size_id)
);
create index on public.product_nui_sizes (nui_size_id);

create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id     integer not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);
create index on public.product_tags (tag_id);

create table public.product_filaments (
  product_id  uuid not null references public.products(id) on delete cascade,
  filament_id integer not null references public.filaments(id),
  is_default  boolean not null default false,
  primary key (product_id, filament_id)
);
create unique index product_filaments_one_default
  on public.product_filaments (product_id) where is_default;

create table public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- products.favorite_count は §4.4.2 コメントで「集計キャッシュ（トリガで更新）」と
-- 明記されているが、review_count/review_avg（§4.4.5）のような具体的なトリガSQLは
-- 示されていなかった。同章の refresh_product_review_stats() と同じパターンで補う。
create or replace function public.refresh_product_favorite_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  update public.products p set
    favorite_count = s.cnt
  from (
    select count(*) cnt from public.favorites where product_id = pid
  ) s
  where p.id = pid;
  return null;
end $$;

create trigger favorites_count
  after insert or delete on public.favorites
  for each row execute function public.refresh_product_favorite_count();

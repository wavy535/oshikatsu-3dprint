-- =============================================================================
-- Osinest（オシネスト）Phase 1: コアスキーマ
-- 推し活特化型3Dプリント受託販売ECプラットフォーム
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUM 型
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('buyer', 'creator', 'admin');
create type public.tag_type as enum ('category', 'nui_size', 'worldview');
create type public.work_status as enum ('draft', 'published', 'archived');
create type public.order_status as enum (
  'payment_pending',
  'paid',
  'printing_queued',
  'printing',
  'packaging',
  'shipped',
  'completed',
  'cancelled',
  'refunded'
);
create type public.custom_request_status as enum ('pending', 'responded', 'accepted', 'declined');
create type public.payout_status as enum ('requested', 'processing', 'paid', 'rejected');

-- -----------------------------------------------------------------------------
-- profiles: auth.users を拡張するユーザープロフィール
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'buyer',
  display_name text not null,
  avatar_url text,
  bio text,
  sns_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'auth.usersに紐づくプロフィール。1ユーザーが購入者・クリエイターを兼務可能（roleはクリエイター申請可否のフラグ用途）';

-- -----------------------------------------------------------------------------
-- addresses: 配送先住所
-- -----------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_name text not null,
  postal_code text not null,
  prefecture text not null,
  city text not null,
  address_line text not null,
  phone text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index addresses_user_id_idx on public.addresses (user_id);

-- -----------------------------------------------------------------------------
-- payout_accounts: クリエイター振込先口座（1クリエイター1件）
-- -----------------------------------------------------------------------------
create table public.payout_accounts (
  creator_id uuid primary key references public.profiles (id) on delete cascade,
  bank_name text not null,
  branch_name text not null,
  account_type text not null,
  account_number text not null,
  account_holder_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- tags: カテゴリ／対応ぬいサイズ／世界観タグ（共通マスタ）
-- -----------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  type public.tag_type not null,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  unique (type, slug)
);

insert into public.tags (type, name, slug, sort_order) values
  ('category', '台座', 'daiza', 1),
  ('category', '家具', 'kagu', 2),
  ('category', '背景', 'haikei', 3),
  ('category', '小物', 'komono', 4),
  ('category', 'ケース', 'case', 5),
  ('nui_size', '10cm', '10cm', 1),
  ('nui_size', '15cm', '15cm', 2),
  ('nui_size', '20cm', '20cm', 3),
  ('nui_size', 'その他', 'other', 4),
  ('worldview', '和風', 'wafu', 1),
  ('worldview', 'レトロ', 'retro', 2),
  ('worldview', 'サイバー', 'cyber', 3),
  ('worldview', 'ゴシック', 'gothic', 4);

-- -----------------------------------------------------------------------------
-- user_nui_sizes: マイぬいサイズ登録（ワンクリック適合検索用）
-- -----------------------------------------------------------------------------
create table public.user_nui_sizes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

-- -----------------------------------------------------------------------------
-- works: クリエイターが投稿する3Dプリント作品
-- -----------------------------------------------------------------------------
create table public.works (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  stock_limit integer check (stock_limit is null or stock_limit >= 0),
  status public.work_status not null default 'draft',
  stl_storage_path text not null, -- private storage bucket path, non公開
  filament_material text not null,
  filament_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index works_creator_id_idx on public.works (creator_id);
create index works_status_idx on public.works (status);

create table public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0
);

create index work_images_work_id_idx on public.work_images (work_id);

create table public.work_tags (
  work_id uuid not null references public.works (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (work_id, tag_id)
);

create index work_tags_tag_id_idx on public.work_tags (tag_id);

-- -----------------------------------------------------------------------------
-- お気に入り / フォロー
-- -----------------------------------------------------------------------------
create table public.work_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create table public.creator_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);

-- -----------------------------------------------------------------------------
-- 推し空間コーディネート投稿
-- -----------------------------------------------------------------------------
create table public.coordinate_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_storage_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create index coordinate_posts_user_id_idx on public.coordinate_posts (user_id);

create table public.coordinate_post_pins (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.coordinate_posts (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  x_percent numeric(5, 2) not null check (x_percent between 0 and 100),
  y_percent numeric(5, 2) not null check (y_percent between 0 and 100),
  created_at timestamptz not null default now()
);

create index coordinate_post_pins_post_id_idx on public.coordinate_post_pins (post_id);

-- -----------------------------------------------------------------------------
-- オーダーメイド相談リクエスト
-- -----------------------------------------------------------------------------
create table public.custom_order_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  reference_work_id uuid references public.works (id) on delete set null,
  message text not null,
  status public.custom_request_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- カート
-- -----------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (cart_id, work_id)
);

-- -----------------------------------------------------------------------------
-- 注文・決済（受託製造ロジック：運営が印刷・検品・発送を担う）
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  status public.order_status not null default 'payment_pending',
  subtotal_amount integer not null,
  platform_fee_amount integer not null default 0,
  print_cost_amount integer not null default 0,
  total_amount integer not null,
  shipping_address_id uuid references public.addresses (id) on delete set null,
  stripe_payment_intent_id text,
  tracking_number text,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete restrict,
  creator_id uuid not null references public.profiles (id) on delete restrict,
  unit_price integer not null,
  quantity integer not null check (quantity > 0),
  creator_payout_amount integer not null, -- 販売価格 - (運営手数料 + 印刷コスト)
  platform_fee_amount integer not null,
  print_cost_amount integer not null,
  stl_storage_path_snapshot text not null,
  filament_material_snapshot text not null,
  filament_color_snapshot text not null,
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_creator_id_idx on public.order_items (creator_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  note text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id);

-- -----------------------------------------------------------------------------
-- クリエイター売上・振込申請
-- -----------------------------------------------------------------------------
create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  status public.payout_status not null default 'requested',
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index payout_requests_creator_id_idx on public.payout_requests (creator_id);

-- -----------------------------------------------------------------------------
-- レビュー・Q&A・メッセージ・通知
-- -----------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  photo_storage_path text,
  created_at timestamptz not null default now()
);

create index reviews_work_id_idx on public.reviews (work_id);

create table public.qna_threads (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  asker_id uuid not null references public.profiles (id) on delete cascade,
  question text not null,
  answer text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index qna_threads_work_id_idx on public.qna_threads (work_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete set null,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_recipient_id_idx on public.messages (recipient_id);
create index messages_order_id_idx on public.messages (order_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);

-- -----------------------------------------------------------------------------
-- updated_at 自動更新トリガー
-- -----------------------------------------------------------------------------
create function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.payout_accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.works
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 新規ユーザー登録時に profiles / carts を自動作成
-- -----------------------------------------------------------------------------
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.carts (user_id) values (new.id);

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 権限ヘルパー関数
-- -----------------------------------------------------------------------------
create function public.is_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

-- ============================================================
-- 0002: ユーザー系テーブル
-- DESIGN.md §4.4.1 準拠
-- ============================================================

-- ─────────────────────────────────────────────
-- profiles : auth.users の 1:1 拡張
-- ─────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text not null unique
                  check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 50),
  avatar_url    text,
  bio           text check (char_length(bio) <= 1000),
  role          user_role not null default 'user',
  is_creator    boolean  not null default false,
  email_opt_in  boolean  not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.profiles (is_creator) where deleted_at is null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ★DESIGN.md からの補正: 元の 'u' || uuid(32桁) は33文字になり、
  --   直上の handle の check 制約（3〜20文字）に違反しサインアップ不能だった
  --   （supabase start で実 DB に signInWithOtp を通した際に検出）。
  --   19桁に切り詰めて 'u' 込み20文字に収める。
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    'u' || substr(replace(new.id::text, '-', ''), 1, 19),
    coalesce(new.raw_user_meta_data->>'name', 'ゲスト')
  );
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- nui_sizes : マイぬいサイズマスタ
-- ─────────────────────────────────────────────
create table public.nui_sizes (
  id           smallint primary key,
  label        text not null unique,
  height_mm    integer not null,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true
);

-- ─────────────────────────────────────────────
-- user_nuis : 購入者が登録する「マイぬい」
-- ─────────────────────────────────────────────
create table public.user_nuis (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 30),
  nui_size_id  smallint not null references public.nui_sizes(id),
  custom_height_mm integer check (custom_height_mm between 10 and 1000),
  photo_url    text,
  note         text check (char_length(note) <= 300),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.user_nuis (user_id);
create unique index user_nuis_one_primary
  on public.user_nuis (user_id) where is_primary;
create trigger user_nuis_set_updated_at
  before update on public.user_nuis
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- shipping_addresses : 配送先（複数登録可）
-- ─────────────────────────────────────────────
create table public.shipping_addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  postal_code   text not null check (postal_code ~ '^\d{3}-?\d{4}$'),
  prefecture    text not null,
  city          text not null,
  address_line1 text not null,
  address_line2 text,
  phone         text not null check (phone ~ '^[0-9\-+]{10,15}$'),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.shipping_addresses (user_id) where deleted_at is null;
create unique index shipping_addresses_one_default
  on public.shipping_addresses (user_id) where is_default and deleted_at is null;
create trigger shipping_addresses_set_updated_at
  before update on public.shipping_addresses
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- creator_profiles : クリエイター申請・審査情報
-- ─────────────────────────────────────────────
create table public.creator_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  status         creator_status not null default 'pending',
  legal_name     text not null,
  legal_name_kana text not null,
  birth_date     date not null,
  intro          text check (char_length(intro) <= 2000),
  portfolio_url  text,
  commission_rate numeric(4,3) not null default 0.300
                   check (commission_rate between 0 and 1),
  approved_at    timestamptz,
  approved_by    uuid references public.profiles(id),
  reject_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger creator_profiles_set_updated_at
  before update on public.creator_profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- payout_accounts : 振込口座（★最重要機密）
-- ─────────────────────────────────────────────
create table public.payout_accounts (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  bank_name       text not null,
  bank_code       text not null check (bank_code ~ '^\d{4}$'),
  branch_name     text not null,
  branch_code     text not null check (branch_code ~ '^\d{3}$'),
  account_type    text not null check (account_type in ('ordinary','checking')),
  account_number_enc bytea not null,
  account_holder_kana text not null check (account_holder_kana ~ '^[ｦ-ﾟア-ンー（）\.\-　 ]+$'),
  updated_at      timestamptz not null default now()
);
comment on table public.payout_accounts is
  '本人と service_role のみアクセス可。Admin 画面にも平文表示しない（振込CSV生成時のみ復号）';
create trigger payout_accounts_set_updated_at
  before update on public.payout_accounts
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- payout_export_logs : 口座復号の監査ログ（§8.3）
-- ─────────────────────────────────────────────
create table public.payout_export_logs (
  id bigint generated always as identity primary key,
  exported_by uuid not null references public.profiles(id),
  payout_ids  uuid[] not null,
  row_count   integer not null,
  created_at  timestamptz not null default now()
);

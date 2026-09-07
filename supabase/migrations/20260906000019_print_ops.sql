-- ============================================================
-- 0019: 運営オペレーション（印刷キュー・ジョブ・検品）と修正依頼
--
-- Figma ④運営オペレーション の 3 画面が要求するもの:
--   印刷キュー一覧   … 決済済み注文明細ごとに 1 ジョブ
--   印刷ジョブ詳細   … STEP2 の印刷指示がそのまま届く／実績を記録して完了
--   検品・発送登録   … 6 項目チェック。NG の原因がモデル側ならクリエイターへ修正依頼
-- ============================================================

create type print_job_status  as enum ('queued', 'printing', 'inspection', 'done', 'failed');
create type inspection_result as enum ('pass', 'fail_model', 'fail_print');
create type fix_request_status as enum ('open', 'resolved', 'dismissed');

-- ────────────────────────────────────────────────────────────
-- STEP2「印刷指示」: パーツ（= product_assets の 1 行）ごとの指示。
-- 新テーブルを作らず既存のパーツ行に足す。1 パーツ 1 指示で十分なため。
-- ────────────────────────────────────────────────────────────
alter table public.product_assets
  add column layer_direction text check (layer_direction in ('z_up', 'z_down', 'x_flat', 'auto')),
  add column support_type    text check (support_type in ('none', 'normal', 'tree', 'auto')),
  add column color_slot      smallint check (color_slot between 1 and 8),
  add column filament_id     integer references public.filaments(id),
  add column print_note      text check (char_length(print_note) <= 500);

comment on column public.product_assets.layer_direction is
  'STEP2 の積層方向。運営の印刷ジョブ詳細にそのまま表示される';

-- ────────────────────────────────────────────────────────────
-- STEP1「3Dデータの自動検証」の結果。7 項目を jsonb で持つ。
-- 判定ロジックはアプリ側（features/products/asset-validation.ts）にあり、
-- ここは結果の保管とジョブ画面への持ち回しだけを担う。
-- ────────────────────────────────────────────────────────────
create table public.product_asset_validations (
  asset_id     uuid primary key references public.product_assets(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  passed       boolean not null,
  checks       jsonb   not null default '{}'::jsonb,
  triangle_count integer,
  bbox_w_mm    numeric(10,2),
  bbox_d_mm    numeric(10,2),
  bbox_h_mm    numeric(10,2),
  shell_count  integer,
  created_at   timestamptz not null default now()
);
create index on public.product_asset_validations (product_id);

-- ────────────────────────────────────────────────────────────
-- print_jobs : 注文明細 1 行 = 印刷ジョブ 1 件
-- ────────────────────────────────────────────────────────────
create table public.print_jobs (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null unique references public.order_items(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete restrict,
  creator_id     uuid not null references public.profiles(id) on delete restrict,
  nui_size_id    smallint references public.nui_sizes(id),

  status         print_job_status not null default 'queued',
  due_at         timestamptz,

  est_weight_g   integer,
  est_print_min  integer,
  part_count     integer not null default 1,

  -- 印刷完了時に運営が記録する実績
  actual_weight_g  integer check (actual_weight_g >= 0),
  actual_print_min integer check (actual_print_min >= 0),
  actual_filament_id integer references public.filaments(id),

  operator_id    uuid references public.profiles(id),
  started_at     timestamptz,
  printed_at     timestamptz,
  inspected_at   timestamptz,
  note           text check (char_length(note) <= 2000),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.print_jobs (status, due_at);
create index on public.print_jobs (order_id);
create index on public.print_jobs (creator_id);
create trigger print_jobs_set_updated_at
  before update on public.print_jobs
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- print_job_inspections : 検品 1 回分。6 項目のチェック結果を checks に持つ
-- ────────────────────────────────────────────────────────────
create table public.print_job_inspections (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.print_jobs(id) on delete cascade,
  inspector_id uuid not null references public.profiles(id),
  result       inspection_result not null,
  checks       jsonb not null default '{}'::jsonb,
  comment      text check (char_length(comment) <= 2000),
  photo_url    text,
  created_at   timestamptz not null default now()
);
create index on public.print_job_inspections (job_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- product_fix_requests : 検品 NG（モデル側）でクリエイターへ飛ぶ修正依頼
-- ────────────────────────────────────────────────────────────
create table public.product_fix_requests (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  creator_id   uuid not null references public.profiles(id) on delete cascade,
  job_id       uuid references public.print_jobs(id) on delete set null,
  status       fix_request_status not null default 'open',
  reason       text not null check (char_length(reason) between 1 and 2000),
  inspector_comment text check (char_length(inspector_comment) <= 2000),
  photo_url    text,
  -- 原因がモデル側なので再印刷の代行費はクリエイター負担になる（Figma 2097:1419）
  reprint_fee  integer not null default 0 check (reprint_fee >= 0),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index on public.product_fix_requests (creator_id, status, created_at desc);
create index on public.product_fix_requests (product_id);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table public.product_asset_validations enable row level security;
create policy asset_validations_select on public.product_asset_validations
  for select using (public.owns_product(product_id) or public.is_admin());
create policy asset_validations_write on public.product_asset_validations
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

-- 印刷ジョブは運営の作業台。クリエイターは自分の作品のジョブを読めるだけ。
alter table public.print_jobs enable row level security;
create policy print_jobs_admin_all on public.print_jobs
  for all using (public.is_admin()) with check (public.is_admin());
create policy print_jobs_select_creator on public.print_jobs
  for select using (creator_id = auth.uid());
create policy print_jobs_select_buyer on public.print_jobs
  for select using (public.owns_order(order_id));

alter table public.print_job_inspections enable row level security;
create policy inspections_admin_all on public.print_job_inspections
  for all using (public.is_admin()) with check (public.is_admin());
create policy inspections_select_creator on public.print_job_inspections
  for select using (
    exists (select 1 from public.print_jobs j
            where j.id = job_id and j.creator_id = auth.uid())
  );

alter table public.product_fix_requests enable row level security;
create policy fix_requests_admin_all on public.product_fix_requests
  for all using (public.is_admin()) with check (public.is_admin());
create policy fix_requests_select_creator on public.product_fix_requests
  for select using (creator_id = auth.uid());
-- クリエイターは「対応済みにする」だけできる（依頼内容は書き換えられない）
create policy fix_requests_update_creator on public.product_fix_requests
  for update using (creator_id = auth.uid())
       with check (creator_id = auth.uid());

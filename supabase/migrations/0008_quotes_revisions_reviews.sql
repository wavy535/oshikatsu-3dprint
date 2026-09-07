-- =============================================================================
-- 0008_quotes_revisions_reviews.sql
--
-- 途切れていた2本の導線をつなぎ、レビューの宛先を分ける。
--
-- 1. オーダーメイドの決済導線
--    相談フォーム（custom_order_requests）はあったが、そこから注文になる経路が
--    存在しなかった。見積りを1件のレコードとして持ち、購入者が承認したら
--    その人専用の work_variant を作って通常の決済フローに合流させる。
--
-- 2. クリエイターへの修正依頼
--    検品NGで原因を model（モデル側）にすると「クリエイターに通知が飛ぶ」
--    設計にしていたが、その通知の実体も、受け取って対応する場所もなかった。
--
-- 3. レビューの宛先
--    項目別評価が「印刷品質・梱包・発送の速さ」＝すべて運営の担当範囲だった。
--    クリエイターのプロフィールに出る評価が運営の仕事で上下するのはおかしいので、
--    クリエイター向けの軸（デザイン・説明との一致・サイズ感）を主に置き、
--    運営向けの軸は任意入力として分けて持つ。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. オーダーメイドの見積り
-- -----------------------------------------------------------------------------
create type public.quote_status as enum (
  'draft',      -- クリエイターが作成中
  'sent',       -- 購入者に提示済み
  'accepted',   -- 承認され、決済待ち
  'ordered',    -- 決済まで完了
  'revision',   -- 購入者が修正を依頼
  'declined',   -- 購入者が辞退
  'expired'     -- 有効期限切れ
);

create table public.custom_order_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique,                          -- 例: CR-0042（画面表示用）
  request_id uuid not null references public.custom_order_requests (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  base_work_id uuid references public.works (id) on delete set null,
  status public.quote_status not null default 'draft',

  -- 確定した仕様。画面の「確定した仕様」テーブルがそのまま入る。
  -- 項目名が案件ごとに変わる（刻印・スタンドホール・中間サイズ…）ので
  -- 列に固定せず、[{label, value, requested}] の配列で持つ。
  spec jsonb not null default '[]'::jsonb,

  -- 見積りの根拠（カスタムデータを検証した結果のスナップショット）
  asset_id uuid references public.work_assets (id) on delete set null,
  est_filament_grams numeric(8,1),
  est_print_hours numeric(6,2),
  part_count integer not null default 1 check (part_count > 0),
  max_part_bbox_x_mm numeric(8,2),
  max_part_bbox_y_mm numeric(8,2),
  max_part_bbox_z_mm numeric(8,2),

  -- 金額
  price_jpy integer not null check (price_jpy >= 0),       -- 作品代金（クリエイターの取り分の元）
  print_fee_jpy integer not null default 0 check (print_fee_jpy >= 0),
  shipping_fee_jpy integer not null default 0 check (shipping_fee_jpy >= 0),

  lead_time_days integer not null default 10 check (lead_time_days > 0),
  note text,
  expires_at timestamptz not null default now() + interval '7 days',

  -- 承認後に作られる専用バリアント（他の人は買えない）
  variant_id uuid references public.work_variants (id) on delete set null,
  accepted_at timestamptz,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_order_quotes_request_idx on public.custom_order_quotes (request_id);
create index custom_order_quotes_buyer_idx on public.custom_order_quotes (buyer_id, status);
create index custom_order_quotes_creator_idx on public.custom_order_quotes (creator_id, status);
-- 1つの相談に「提示中」の見積りは1件まで
create unique index custom_order_quotes_one_open_idx
  on public.custom_order_quotes (request_id) where status in ('sent', 'accepted');

comment on table public.custom_order_quotes is
  'オーダーメイド相談に対する見積り。承認されると専用バリアントを作って通常の決済に合流する。';
comment on column public.custom_order_quotes.spec is
  '確定仕様。[{"label":"サイズ","value":"13cm","requested":"13cmのぬい用がほしい"}] の配列。';

create sequence public.quote_no_seq start with 1001;

create or replace function public.assign_quote_no() returns trigger
language plpgsql as $$
begin
  if new.quote_no is null or new.quote_no = '' then
    new.quote_no := 'CR-' || nextval('public.quote_no_seq')::text;
  end if;

  -- 代行費は見積り作成者が手で入れるのではなく、材料量と造形時間から計算する。
  -- 手入力を許すと、画面に出る内訳と実際の請求額が食い違う。
  if new.est_filament_grams is not null and new.est_print_hours is not null then
    new.print_fee_jpy := public.calc_print_fee(
      new.est_filament_grams, new.est_print_hours, new.part_count);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger custom_order_quotes_assign_no
  before insert or update on public.custom_order_quotes
  for each row execute function public.assign_quote_no();

-- 購入者の支払額（画面のお支払い内訳と一致させる）
create or replace function public.quote_total_jpy(q public.custom_order_quotes)
returns integer language sql immutable as $$
  select q.price_jpy + q.print_fee_jpy + q.shipping_fee_jpy;
$$;

-- 見積りを承認したら、その人専用のバリアントを作る。
-- 専用なので stock=1、公開一覧には出さない（is_listed=false）。
create or replace function public.accept_custom_quote(p_quote_id uuid)
returns uuid language plpgsql as $$
declare
  q public.custom_order_quotes;
  v_id uuid;
  w_id uuid;
begin
  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then raise exception '見積りが見つかりません'; end if;
  if q.status <> 'sent' then raise exception '提示中の見積りではありません（status=%）', q.status; end if;
  if q.expires_at < now() then
    update public.custom_order_quotes set status = 'expired' where id = p_quote_id;
    raise exception 'この見積りは有効期限を過ぎています';
  end if;

  -- ベース作品がなければ、この見積り専用の作品を1つ作る
  w_id := q.base_work_id;
  if w_id is null then
    insert into public.works (creator_id, title, description, status)
    values (q.creator_id, 'オーダーメイド ' || q.quote_no, coalesce(q.note, ''), 'draft')
    returning id into w_id;
  end if;

  insert into public.work_variants (
    work_id, size_label, scale_ratio, asset_id,
    max_part_bbox_x_mm, max_part_bbox_y_mm, max_part_bbox_z_mm,
    est_filament_grams, est_print_hours, part_count,
    price_jpy, stock, is_listed
  ) values (
    w_id, 'オーダーメイド ' || q.quote_no, 1.0, q.asset_id,
    q.max_part_bbox_x_mm, q.max_part_bbox_y_mm, q.max_part_bbox_z_mm,
    q.est_filament_grams, q.est_print_hours, q.part_count,
    q.price_jpy, 1, false
  ) returning id into v_id;

  update public.custom_order_quotes
     set status = 'accepted', variant_id = v_id, accepted_at = now()
   where id = p_quote_id;

  update public.custom_order_requests set status = 'accepted' where id = q.request_id;

  return v_id;
end;
$$;

comment on function public.accept_custom_quote(uuid) is
  '見積りを承認し、購入者専用の work_variant を作って id を返す。以降は通常のカート・決済に乗る。';

-- 期限切れの見積りを閉じる（日次バッチから呼ぶ）
create or replace function public.expire_custom_quotes() returns integer
language plpgsql as $$
declare n integer;
begin
  update public.custom_order_quotes
     set status = 'expired'
   where status = 'sent' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. クリエイターへの修正依頼
-- -----------------------------------------------------------------------------
create type public.revision_status as enum (
  'open',        -- 対応待ち
  'in_progress', -- クリエイターが対応中
  'resolved',    -- 修正データを受け取り、運営が確認済み
  'disputed',    -- 原因判定に異議
  'cancelled'
);

create type public.revision_resolution as enum (
  'reupload',       -- データを修正して差し替える
  'instruction',    -- 印刷指示だけ変更する
  'unlist',         -- そのサイズを出品停止にする
  'no_action'
);

create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  revision_no text unique,                       -- 例: RV-0007
  work_id uuid not null references public.works (id) on delete cascade,
  variant_id uuid references public.work_variants (id) on delete set null,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  inspection_id uuid references public.qc_inspections (id) on delete set null,
  print_job_id uuid references public.print_jobs (id) on delete set null,
  object_id uuid references public.work_asset_objects (id) on delete set null,

  status public.revision_status not null default 'open',
  cause public.reprint_cause not null default 'model',
  message text not null,                         -- 検品担当の指摘
  photo_paths text[] not null default '{}',
  due_at timestamptz not null default now() + interval '4 days',

  -- 再印刷のコスト負担。cause='model' のときだけクリエイター負担になる。
  reprint_fee_jpy integer not null default 0 check (reprint_fee_jpy >= 0),
  charged_to_creator boolean not null default false,

  resolution public.revision_resolution,
  resolution_note text,
  resolved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index revision_requests_creator_idx on public.revision_requests (creator_id, status);
create index revision_requests_work_idx on public.revision_requests (work_id);
create index revision_requests_due_idx on public.revision_requests (due_at) where status = 'open';

comment on table public.revision_requests is
  '検品NG（原因＝モデル側）からクリエイターに送られる修正依頼。対応するまで該当サイズは出品停止。';
comment on column public.revision_requests.charged_to_creator is
  'cause=model のとき true。再印刷の代行費はクリエイター負担となり、次回の売上から差し引く。';

create sequence public.revision_no_seq start with 1001;

create or replace function public.assign_revision_no() returns trigger
language plpgsql as $$
begin
  if new.revision_no is null or new.revision_no = '' then
    new.revision_no := 'RV-' || nextval('public.revision_no_seq')::text;
  end if;
  new.charged_to_creator := (new.cause = 'model');
  new.updated_at := now();
  return new;
end;
$$;

create trigger revision_requests_assign_no
  before insert or update on public.revision_requests
  for each row execute function public.assign_revision_no();

-- 修正依頼が開いている間は、そのサイズを出品停止にする。
-- 直っていないものが売れ続けて、同じ不良を刷り続けるのを防ぐ。
create or replace function public.apply_revision_listing() returns trigger
language plpgsql as $$
begin
  if new.variant_id is null then return null; end if;

  if new.status = 'open' or new.status = 'in_progress' then
    update public.work_variants set is_listed = false where id = new.variant_id;
  elsif new.status = 'resolved' and new.resolution <> 'unlist' then
    -- 自動では再公開しない。クリエイターが内容を確認して自分で戻す。
    null;
  end if;
  return null;
end;
$$;

create trigger revision_requests_apply_listing
  after insert or update of status on public.revision_requests
  for each row execute function public.apply_revision_listing();

-- 検品NGで原因がモデル側なら、修正依頼を自動で作る
create or replace function public.create_revision_from_qc() returns trigger
language plpgsql as $$
declare
  j public.print_jobs;
  v public.work_variants;
  w_id uuid;
  c_id uuid;
begin
  if new.result <> 'failed' or new.reprint_cause <> 'model' then
    return null;
  end if;

  select * into j from public.print_jobs where id = new.print_job_id;
  if not found or j.variant_id is null then return null; end if;

  select * into v from public.work_variants where id = j.variant_id;
  if not found then return null; end if;

  select w.id, w.creator_id into w_id, c_id from public.works w where w.id = v.work_id;
  if w_id is null then return null; end if;

  -- 同じジョブで開いている依頼があれば重ねない
  if exists (
    select 1 from public.revision_requests r
     where r.print_job_id = j.id and r.status in ('open', 'in_progress')
  ) then
    return null;
  end if;

  insert into public.revision_requests (
    work_id, variant_id, creator_id, inspection_id, print_job_id,
    cause, message, photo_paths, reprint_fee_jpy, created_by
  ) values (
    w_id, v.id, c_id, new.id, j.id,
    new.reprint_cause, coalesce(new.memo, '検品で不合格になりました'), new.photo_paths,
    coalesce(j.print_fee_snapshot, v.print_fee_jpy, 0), new.inspector_id
  );

  return null;
end;
$$;

create trigger qc_inspections_create_revision
  after insert on public.qc_inspections
  for each row execute function public.create_revision_from_qc();

-- -----------------------------------------------------------------------------
-- 3. レビューの宛先を分ける
-- -----------------------------------------------------------------------------
-- クリエイターへの評価（プロフィールの星に反映される）
alter table public.reviews add column design_rating smallint
  check (design_rating between 1 and 5);
alter table public.reviews add column accuracy_rating smallint
  check (accuracy_rating between 1 and 5);
alter table public.reviews add column size_fit_rating smallint
  check (size_fit_rating between 1 and 5);

-- 運営への評価（任意。クリエイターの評価には反映しない）
alter table public.reviews add column print_quality_rating smallint
  check (print_quality_rating between 1 and 5);
alter table public.reviews add column packaging_rating smallint
  check (packaging_rating between 1 and 5);
alter table public.reviews add column shipping_rating smallint
  check (shipping_rating between 1 and 5);

alter table public.reviews add column is_anonymous boolean not null default false;

comment on column public.reviews.rating is
  'クリエイターへの総合評価。プロフィールに表示される星はこれと下の3軸から出す。';
comment on column public.reviews.design_rating is 'デザイン・完成度（クリエイターへの評価）';
comment on column public.reviews.accuracy_rating is '写真・説明との一致（クリエイターへの評価）';
comment on column public.reviews.size_fit_rating is 'サイズ感・飾りやすさ（クリエイターへの評価）';
comment on column public.reviews.print_quality_rating is
  '印刷品質（運営への評価・任意）。クリエイターの平均点には含めない。';
comment on column public.reviews.packaging_rating is '梱包（運営への評価・任意）';
comment on column public.reviews.shipping_rating is '発送の速さ（運営への評価・任意）';

-- クリエイターの評価サマリ。運営あての軸は意図的に含めない。
create or replace view public.creator_rating_summary as
select
  r.creator_id,
  count(*) as review_count,
  round(avg(r.rating)::numeric, 2) as avg_rating,
  round(avg(r.design_rating)::numeric, 2) as avg_design,
  round(avg(r.accuracy_rating)::numeric, 2) as avg_accuracy,
  round(avg(r.size_fit_rating)::numeric, 2) as avg_size_fit,
  count(*) filter (where r.rating = 5) as five_star_count,
  max(r.created_at) as last_reviewed_at
from public.reviews r
group by r.creator_id;

comment on view public.creator_rating_summary is
  'クリエイターの公開プロフィールに出す評価。印刷・梱包・配送は運営の担当なので含めない。';

-- 運営オペレーションの品質サマリ（運営コンソール用）
create or replace view public.ops_rating_summary as
select
  date_trunc('month', r.created_at) as month,
  count(*) filter (where r.print_quality_rating is not null) as answered_count,
  round(avg(r.print_quality_rating)::numeric, 2) as avg_print_quality,
  round(avg(r.packaging_rating)::numeric, 2) as avg_packaging,
  round(avg(r.shipping_rating)::numeric, 2) as avg_shipping
from public.reviews r
group by 1;

comment on view public.ops_rating_summary is '運営あて評価の月次サマリ。印刷代行の品質を運営が自分で見るためのもの。';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.custom_order_quotes enable row level security;
alter table public.revision_requests enable row level security;

create policy "quotes readable by参加者" on public.custom_order_quotes
  for select using (
    public.is_admin() or buyer_id = auth.uid() or creator_id = auth.uid()
  );
-- 見積りを作れるのはクリエイター（と運営）
create policy "quotes writable by creator" on public.custom_order_quotes
  for all using (public.is_admin() or creator_id = auth.uid())
  with check (public.is_admin() or creator_id = auth.uid());

create policy "revisions readable by creator or admin" on public.revision_requests
  for select using (public.is_admin() or creator_id = auth.uid());
-- 依頼を作れるのは運営だけ。クリエイターは自分の依頼を更新（対応）できる。
create policy "revisions created by admin" on public.revision_requests
  for insert with check (public.is_admin());
create policy "revisions updated by creator or admin" on public.revision_requests
  for update using (public.is_admin() or creator_id = auth.uid())
  with check (public.is_admin() or creator_id = auth.uid());
create policy "revisions deleted by admin" on public.revision_requests
  for delete using (public.is_admin());

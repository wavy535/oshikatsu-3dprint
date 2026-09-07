-- =============================================================================
-- 0006_print_ops.sql
--
-- 運営オペレーション（印刷キュー → 印刷ジョブ → 検品 → 発送）のデータ設計。
--
-- 背景：
--   0005 で「何をどう印刷するか」（work_variants / work_part_instructions /
--   work_color_slots）は設計できたが、「実際に誰がいつ刷って、検品して、
--   どう送ったか」を持つ場所がなかった。注文が入っても運営の手元に作業単位が
--   生まれず、印刷代行という事業の中心部分が記録されないままだった。
--
--   orders（注文）
--     └ order_items（明細：どの variant を何個）
--          └ print_jobs（印刷ジョブ：1明細 = 1ジョブ。バッチは job 内で回す）
--               ├ print_job_events（ステータス遷移の履歴）
--               ├ filament_ledger（このジョブで実際に消費したフィラメント）
--               └ qc_inspections（検品記録）
--                    └ qc_check_results（チェック項目ごとの合否）
--     └ shipments（発送：1注文 = 1発送。同梱を前提とする）
--
--   注文のステータス（orders.status）は print_jobs / shipments から自動で
--   導出する。運営が二重に更新して食い違うことがないようにするため。
--
-- あわせて 0005 の価格モデルを見直す：
--   モックの決済画面は「商品代金 / 印刷代行費 / 送料」を分けて購入者に見せて
--   いるのに対し、0005 は販売価格に代行費が含まれる前提で下限を計算していた。
--   サイズによって代行費が数倍変わるサービスでは、代行費を別建てにしたほうが
--   クリエイターは「デザインの値段」だけを決められる。切り替えられるように
--   print_pricing_rules に課金モデルを持たせ、既定を「別建て」にする。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 列挙型
-- -----------------------------------------------------------------------------
create type public.print_job_status as enum (
  'queued',      -- 未着手
  'printing',    -- 印刷中
  'printed',     -- 印刷完了（検品待ち）
  'qc_passed',   -- 検品OK
  'qc_failed',   -- 検品NG（再印刷へ）
  'reprinting',  -- 再印刷中
  'cancelled'
);

create type public.qc_result as enum ('passed', 'failed');

create type public.reprint_cause as enum (
  'model',     -- モデル側（クリアランス不足・薄すぎるなど）→ 運営は代行費を負担しない
  'print',     -- 印刷側（層ズレ・造形失敗）→ 運営負担
  'material',  -- 材料側（フィラメント不良）→ 運営負担
  'handling'   -- 取り扱い（検品・梱包時の破損）→ 運営負担
);

create type public.shipping_carrier as enum ('yamato', 'sagawa', 'japanpost', 'other');

create type public.print_fee_billing as enum (
  'bundled',   -- 販売価格に印刷代行費を含める（0005 までの前提）
  'separate'   -- 購入者に別建てで請求する（モックの決済画面と同じ）
);

-- -----------------------------------------------------------------------------
-- 価格モデルの切り替え
-- -----------------------------------------------------------------------------
alter table public.print_pricing_rules
  add column fee_billing public.print_fee_billing not null default 'separate';

comment on column public.print_pricing_rules.fee_billing is
  'separate = 購入者に印刷代行費を別建て請求（既定）。bundled = 販売価格に含める。';

-- bundled のときだけ「代行費を回収できない価格」を弾く
create or replace function public.sync_work_variant() returns trigger
language plpgsql as $$
declare
  r public.print_pricing_rules;
  floor_price integer;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な print_pricing_rules がありません';
  end if;

  new.print_fee_jpy := public.calc_print_fee(new.est_filament_grams, new.est_print_hours, new.part_count);

  if new.bbox_x_mm is not null and new.bbox_y_mm is not null then
    if (greatest(new.bbox_x_mm, new.bbox_y_mm) > greatest(r.bed_x_mm, r.bed_y_mm))
       or (least(new.bbox_x_mm, new.bbox_y_mm) > least(r.bed_x_mm, r.bed_y_mm))
       or (coalesce(new.bbox_z_mm, 0) > r.bed_z_mm) then
      new.is_printable := false;
      new.unprintable_reason := format('造形サイズ %s×%s×%s mm がベッド上限 %s×%s×%s mm を超過',
        new.bbox_x_mm, new.bbox_y_mm, new.bbox_z_mm, r.bed_x_mm, r.bed_y_mm, r.bed_z_mm);
      new.is_listed := false;
    else
      new.is_printable := true;
      new.unprintable_reason := null;
    end if;
  end if;

  if new.batch_count_override is not null then
    new.batch_count := greatest(new.batch_count_override, 1);
  elsif new.est_print_hours is not null then
    new.batch_count := greatest(ceil(new.est_print_hours / r.max_batch_hours)::integer, 1);
  end if;

  if new.is_listed and new.price_jpy is not null then
    if r.fee_billing = 'bundled' then
      floor_price := ceil(new.print_fee_jpy / (1 - r.platform_fee_rate))::integer;
      if new.price_jpy < floor_price then
        raise exception '販売価格 ¥% は下限 ¥% を下回っています（印刷代行費 ¥%、手数料率 % パーセント）',
          new.price_jpy, floor_price, new.print_fee_jpy, round(r.platform_fee_rate * 100);
      end if;
    elsif new.price_jpy < 100 then
      raise exception '販売価格 ¥% が下限 ¥100 を下回っています', new.price_jpy;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 課金モデルに合わせて下限と受取額を出し分ける
-- （列が増えるので create or replace では置き換えられない）
drop view if exists public.work_variant_pricing;

create view public.work_variant_pricing as
select
  v.id,
  v.work_id,
  v.size_label,
  v.nui_size_cm,
  v.scale_ratio,
  v.is_base,
  v.bbox_x_mm, v.bbox_y_mm, v.bbox_z_mm,
  v.est_filament_grams,
  v.est_print_hours,
  v.part_count,
  v.batch_count,
  v.print_fee_jpy,
  v.price_jpy,
  v.stock,
  v.is_listed,
  v.is_printable,
  v.unprintable_reason,
  r.fee_billing,
  case when r.fee_billing = 'bundled'
       then ceil(v.print_fee_jpy / (1 - r.platform_fee_rate))::integer
       else 100
  end as min_price_jpy,
  -- 購入者が実際に払う金額（送料を除く）
  case when v.price_jpy is null then null
       when r.fee_billing = 'separate' then v.price_jpy + v.print_fee_jpy
       else v.price_jpy
  end as buyer_total_jpy,
  case when v.price_jpy is null then null
       when r.fee_billing = 'separate'
         then v.price_jpy - round(v.price_jpy * r.platform_fee_rate)::integer
       else v.price_jpy - v.print_fee_jpy - round(v.price_jpy * r.platform_fee_rate)::integer
  end as creator_payout_jpy
from public.work_variants v
cross join lateral (select * from public.print_pricing_rules where is_active limit 1) r;

comment on view public.work_variant_pricing is
  'サイズ展開に価格下限・購入者総額・クリエイター受取額を付与したビュー。課金モデルで計算が変わる。';

-- -----------------------------------------------------------------------------
-- 出荷期限：注文単位で持つ（キューの並び順とアラートの基準）
-- -----------------------------------------------------------------------------
alter table public.orders add column ship_due_at timestamptz;
alter table public.orders add column gift_wrapping boolean not null default false;

comment on column public.orders.ship_due_at is '出荷期限。印刷キューの並び順と遅延アラートの基準。';

-- -----------------------------------------------------------------------------
-- プリンタ台帳
-- -----------------------------------------------------------------------------
create table public.printers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                     -- 例: P-03
  model_name text not null,                      -- 例: Bambu Lab X1C
  bed_x_mm integer not null default 220,
  bed_y_mm integer not null default 220,
  bed_z_mm integer not null default 250,
  nozzle_mm numeric(3,2) not null default 0.40,
  supports_multicolor boolean not null default false,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create index printers_active_idx on public.printers (is_active) where is_active;

comment on table public.printers is '運営が保有するプリンタ。ジョブの割り当て先。';

insert into public.printers (code, model_name, supports_multicolor, nozzle_mm) values
  ('P-01', 'Bambu Lab P1S',  false, 0.40),
  ('P-02', 'Bambu Lab P1S',  false, 0.40),
  ('P-03', 'Bambu Lab X1C',  true,  0.40),
  ('P-04', 'Prusa MK4',      false, 0.40);

-- -----------------------------------------------------------------------------
-- 印刷ジョブ
--   1 order_item = 1 job。数量が2なら quantity=2 の1ジョブとして扱い、
--   バッチ（何回に分けて刷るか）は job の中の回数として持つ。
-- -----------------------------------------------------------------------------
create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  job_no text not null unique,                   -- 例: J-1041（画面表示用）
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  variant_id uuid references public.work_variants (id) on delete set null,
  status public.print_job_status not null default 'queued',
  printer_id uuid references public.printers (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_at timestamptz,

  quantity integer not null default 1 check (quantity > 0),
  part_count integer not null default 1 check (part_count > 0),
  batch_count integer not null default 1 check (batch_count > 0),
  batch_done integer not null default 0 check (batch_done >= 0),

  -- 受注時点のスナップショット（後からクリエイターが作品を編集しても動かない）
  est_filament_grams numeric(8,1),
  est_print_hours numeric(6,2),
  print_fee_snapshot integer,

  -- 実績（検品後に運営が入力する）
  actual_filament_grams numeric(8,1) check (actual_filament_grams >= 0),
  actual_print_hours numeric(6,2) check (actual_print_hours >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),

  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint print_jobs_batch_done_within_count check (batch_done <= batch_count)
);

create index print_jobs_status_due_idx on public.print_jobs (status, due_at);
create index print_jobs_order_id_idx on public.print_jobs (order_id);
create index print_jobs_printer_idx on public.print_jobs (printer_id) where printer_id is not null;
create unique index print_jobs_order_item_idx on public.print_jobs (order_item_id);

comment on table public.print_jobs is '印刷ジョブ。注文明細1件につき1件つくられ、運営の作業単位になる。';
comment on column public.print_jobs.batch_count is 'ベッドに載りきらない場合に何回に分けて刷るか。work_variants から引き継ぐ。';

-- 遅延しているジョブ（キュー画面の「期限超過」バッジ）
create index print_jobs_overdue_idx on public.print_jobs (due_at)
  where status in ('queued', 'printing', 'reprinting');

-- ジョブ番号の自動採番（J-1001 から）
create sequence public.print_job_no_seq start with 1001;

create or replace function public.assign_print_job_no() returns trigger
language plpgsql as $$
begin
  if new.job_no is null or new.job_no = '' then
    new.job_no := 'J-' || nextval('public.print_job_no_seq')::text;
  end if;
  return new;
end;
$$;

alter table public.print_jobs alter column job_no drop not null;

create trigger print_jobs_assign_no
  before insert on public.print_jobs
  for each row execute function public.assign_print_job_no();

-- -----------------------------------------------------------------------------
-- ジョブのステータス履歴
-- -----------------------------------------------------------------------------
create table public.print_job_events (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references public.print_jobs (id) on delete cascade,
  status public.print_job_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index print_job_events_job_idx on public.print_job_events (print_job_id, created_at);

create or replace function public.log_print_job_event() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.print_job_events (print_job_id, status) values (new.id, new.status);
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'printing' and old.status <> 'printing' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status in ('printed', 'qc_passed') and new.finished_at is null then
      new.finished_at := now();
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- BEFORE で started_at / finished_at を埋め、AFTER で履歴を書く
create or replace function public.touch_print_job() returns trigger
language plpgsql as $$
begin
  if new.status = 'printing' and old.status is distinct from 'printing' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status in ('printed', 'qc_passed') and new.finished_at is null then
    new.finished_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.record_print_job_event() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.print_job_events (print_job_id, status) values (new.id, new.status);
  end if;
  return null;
end;
$$;

drop function if exists public.log_print_job_event();

create trigger print_jobs_touch
  before update on public.print_jobs
  for each row execute function public.touch_print_job();

create trigger print_jobs_record_event
  after insert or update on public.print_jobs
  for each row execute function public.record_print_job_event();

-- -----------------------------------------------------------------------------
-- 検品
-- -----------------------------------------------------------------------------
create table public.qc_inspections (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references public.print_jobs (id) on delete cascade,
  inspector_id uuid references public.profiles (id) on delete set null,
  result public.qc_result not null,
  memo text,
  photo_paths text[] not null default '{}',
  reprint_cause public.reprint_cause,
  created_at timestamptz not null default now(),

  -- NG のときは原因を必ず選ばせる（誰の負担かが決まらないと運用が止まる）
  constraint qc_failed_requires_cause
    check (result = 'passed' or reprint_cause is not null)
);

create index qc_inspections_job_idx on public.qc_inspections (print_job_id, created_at desc);

comment on table public.qc_inspections is '検品記録。1ジョブに複数回（再印刷のたびに）積み上がる。';
comment on column public.qc_inspections.reprint_cause is
  'model を選ぶと再印刷の代行費は運営負担にならず、クリエイターに修正依頼が飛ぶ。';

-- チェック項目のマスタ（画面の6項目。増減しても過去の記録が壊れないよう別テーブル）
create table public.qc_check_definitions (
  code text primary key,
  label text not null,
  description text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.qc_check_definitions (code, label, description, sort_order) values
  ('dimension', '寸法',        '公差 ±0.5mm 以内（ノギス実測）', 1),
  ('layer',     '積層',        '層ズレ・層間剥離がない',         2),
  ('support',   'サポート跡',  '除去済み・バリなし',             3),
  ('color',     '色・素材',    '指定スロットの色と一致',         4),
  ('assembly',  '組立',        '分割パーツのはめ合い確認',       5),
  ('surface',   '外観',        '傷・汚れ・糸引きがない',         6);

create table public.qc_check_results (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qc_inspections (id) on delete cascade,
  code text not null references public.qc_check_definitions (code) on delete restrict,
  passed boolean not null,
  note text,
  unique (inspection_id, code)
);

comment on table public.qc_check_results is '検品チェック項目ごとの合否。どの項目で落ちやすいかの集計に使う。';

-- 検品結果をジョブのステータスに反映する
create or replace function public.apply_qc_result() returns trigger
language plpgsql as $$
begin
  if new.result = 'passed' then
    update public.print_jobs set status = 'qc_passed' where id = new.print_job_id;
  else
    update public.print_jobs
       set status = 'qc_failed',
           failure_count = failure_count + 1
     where id = new.print_job_id;
  end if;
  return null;
end;
$$;

create trigger qc_inspections_apply
  after insert on public.qc_inspections
  for each row execute function public.apply_qc_result();

-- -----------------------------------------------------------------------------
-- フィラメント消費台帳
--   ジョブの実績を入れたら在庫が減る。手動補充も同じ台帳に積む。
-- -----------------------------------------------------------------------------
create table public.filament_ledger (
  id uuid primary key default gen_random_uuid(),
  filament_id uuid not null references public.filaments (id) on delete restrict,
  delta_grams numeric(9,1) not null,             -- 消費は負、補充は正
  reason text not null,                          -- 'print' / 'restock' / 'waste' / 'adjust'
  print_job_id uuid references public.print_jobs (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index filament_ledger_filament_idx on public.filament_ledger (filament_id, created_at desc);

create or replace function public.apply_filament_ledger() returns trigger
language plpgsql as $$
begin
  update public.filaments
     set stock_grams = greatest(stock_grams + round(new.delta_grams)::integer, 0)
   where id = new.filament_id;
  return null;
end;
$$;

create trigger filament_ledger_apply
  after insert on public.filament_ledger
  for each row execute function public.apply_filament_ledger();

comment on table public.filament_ledger is 'フィラメントの増減記録。filaments.stock_grams はこの台帳の結果。';

-- -----------------------------------------------------------------------------
-- 発送
-- -----------------------------------------------------------------------------
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  carrier public.shipping_carrier not null,
  service_name text,                             -- 例: 宅急便コンパクト
  tracking_number text,
  box_type text,
  weight_grams integer check (weight_grams >= 0),
  size_sum_cm integer check (size_sum_cm >= 0),
  shipping_fee_jpy integer not null default 0 check (shipping_fee_jpy >= 0),
  shipped_at timestamptz not null default now(),
  buyer_notified_at timestamptz,
  packer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index shipments_order_idx on public.shipments (order_id);
create index shipments_tracking_idx on public.shipments (tracking_number)
  where tracking_number is not null;

comment on table public.shipments is '発送記録。1注文1発送（同梱前提）。追跡番号は購入者の注文詳細に出る。';

-- 発送を登録したら注文を「発送済み」にする
create or replace function public.apply_shipment() returns trigger
language plpgsql as $$
begin
  update public.orders
     set status = 'shipped',
         tracking_number = new.tracking_number,
         shipped_at = new.shipped_at,
         updated_at = now()
   where id = new.order_id;
  return null;
end;
$$;

create trigger shipments_apply
  after insert on public.shipments
  for each row execute function public.apply_shipment();

-- -----------------------------------------------------------------------------
-- 注文確定 → 印刷ジョブの生成
--   決済完了時に一度だけ呼ぶ。すでにジョブがある明細はスキップする。
-- -----------------------------------------------------------------------------
create or replace function public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer default 5)
returns integer language plpgsql as $$
declare
  created integer := 0;
  due timestamptz;
begin
  due := coalesce(
    (select ship_due_at from public.orders where id = p_order_id),
    now() + make_interval(days => p_lead_days)
  );

  update public.orders set ship_due_at = due, status = 'printing_queued', updated_at = now()
   where id = p_order_id;

  insert into public.print_jobs (
    order_id, order_item_id, variant_id, quantity, part_count, batch_count,
    est_filament_grams, est_print_hours, print_fee_snapshot, due_at
  )
  select
    oi.order_id,
    oi.id,
    oi.variant_id,
    oi.quantity,
    coalesce(v.part_count, 1),
    coalesce(v.batch_count, 1),
    v.est_filament_grams * oi.quantity,
    v.est_print_hours * oi.quantity,
    coalesce(oi.print_fee_snapshot, v.print_fee_jpy),
    due
  from public.order_items oi
  left join public.work_variants v on v.id = oi.variant_id
  where oi.order_id = p_order_id
    and not exists (select 1 from public.print_jobs j where j.order_item_id = oi.id);

  get diagnostics created = row_count;
  return created;
end;
$$;

comment on function public.create_print_jobs_for_order(uuid, integer) is
  '決済完了時に注文明細から印刷ジョブを生成する。二重に呼んでも増えない。';

-- 全ジョブが検品OKになったら注文を packaging（発送準備）に進める
create or replace function public.sync_order_from_jobs() returns trigger
language plpgsql as $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
  total integer;
  passed integer;
  printing integer;
begin
  select count(*),
         count(*) filter (where status = 'qc_passed'),
         count(*) filter (where status in ('printing', 'reprinting'))
    into total, passed, printing
    from public.print_jobs where order_id = oid and status <> 'cancelled';

  if total = 0 then
    return null;
  end if;

  update public.orders o
     set status = case
           when passed = total then 'packaging'::public.order_status
           when printing > 0 then 'printing'::public.order_status
           else 'printing_queued'::public.order_status
         end,
         updated_at = now()
   where o.id = oid
     and o.status in ('paid', 'printing_queued', 'printing', 'packaging');

  return null;
end;
$$;

create trigger print_jobs_sync_order
  after insert or update of status on public.print_jobs
  for each row execute function public.sync_order_from_jobs();

-- -----------------------------------------------------------------------------
-- 画面用ビュー：印刷キュー一覧
-- -----------------------------------------------------------------------------
create or replace view public.print_queue as
select
  j.id,
  j.job_no,
  j.status,
  j.due_at,
  (j.due_at < now() and j.status in ('queued', 'printing', 'reprinting')) as is_overdue,
  o.id as order_id,
  w.title as work_title,
  v.size_label,
  f.material,
  f.color_name,
  j.est_filament_grams,
  j.est_print_hours,
  j.part_count,
  j.batch_count,
  j.batch_done,
  p.code as printer_code,
  pr.display_name as assignee_name,
  j.created_at
from public.print_jobs j
join public.orders o on o.id = j.order_id
left join public.work_variants v on v.id = j.variant_id
left join public.works w on w.id = v.work_id
left join public.printers p on p.id = j.printer_id
left join public.profiles pr on pr.id = j.assignee_id
left join lateral (
  select fl.material, fl.color_name
    from public.work_color_slots cs
    join public.filaments fl on fl.id = cs.filament_id
   where cs.work_id = w.id
   order by cs.slot_index
   limit 1
) f on true;

comment on view public.print_queue is '運営の印刷キュー画面が読む一覧。素材・色は代表スロット（slot_index が最小）を表示する。';

-- -----------------------------------------------------------------------------
-- RLS：運営専用。購入者は自分の注文の進捗だけ見える。
-- -----------------------------------------------------------------------------
alter table public.printers enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_job_events enable row level security;
alter table public.qc_inspections enable row level security;
alter table public.qc_check_definitions enable row level security;
alter table public.qc_check_results enable row level security;
alter table public.filament_ledger enable row level security;
alter table public.shipments enable row level security;

create policy "printers admin only" on public.printers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "qc definitions readable" on public.qc_check_definitions
  for select using (true);
create policy "qc definitions writable by admin" on public.qc_check_definitions
  for all using (public.is_admin()) with check (public.is_admin());

-- 購入者は自分の注文のジョブ進捗を読める（注文詳細のタイムライン用）
create policy "print jobs readable by owner or admin" on public.print_jobs
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
  );
create policy "print jobs writable by admin" on public.print_jobs
  for all using (public.is_admin()) with check (public.is_admin());

create policy "print job events readable by owner or admin" on public.print_job_events
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.print_jobs j join public.orders o on o.id = j.order_id
       where j.id = print_job_id and o.buyer_id = auth.uid()
    )
  );
create policy "print job events writable by admin" on public.print_job_events
  for all using (public.is_admin()) with check (public.is_admin());

-- 検品の内部メモ・写真は運営だけ
create policy "qc inspections admin only" on public.qc_inspections
  for all using (public.is_admin()) with check (public.is_admin());
create policy "qc check results admin only" on public.qc_check_results
  for all using (public.is_admin()) with check (public.is_admin());
create policy "filament ledger admin only" on public.filament_ledger
  for all using (public.is_admin()) with check (public.is_admin());

-- 追跡番号は購入者にも見せる
create policy "shipments readable by owner or admin" on public.shipments
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
  );
create policy "shipments writable by admin" on public.shipments
  for all using (public.is_admin()) with check (public.is_admin());

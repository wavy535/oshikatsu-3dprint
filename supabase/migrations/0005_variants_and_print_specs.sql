-- =============================================================================
-- 0005_variants_and_print_specs.sql
--
-- 3Dデータ（3MF / STL）の自動検証・印刷仕様・サイズ展開に対応するための拡張。
--
-- 背景：
--   1作品＝1STL＝1価格 という前提では、実データ（例：6オブジェクト・2色・
--   複数サイズ展開のジオラマ）を扱えないことが検証で判明したため、
--   「作品」と「実際に印刷して売る単位」を分離する。
--
--   works（作品：タイトル・説明・タグなど作品共通のメタ）
--     └ work_assets（アップロードされた3Dデータ本体）
--          └ work_asset_objects（データ内の各オブジェクト＝パーツ）
--     └ work_color_slots（データの色定義 → 在庫フィラメントへの割り当て）
--     └ work_part_instructions（パーツごとの積層方向・サポート）
--     └ work_variants（サイズ展開。価格・在庫・印刷代行費はここが持つ）
--
--   カート・注文は works ではなく work_variants を参照する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 列挙型
-- -----------------------------------------------------------------------------
create type public.model_file_format as enum ('3mf', 'stl');
create type public.validation_status as enum ('pending', 'passed', 'warning', 'failed');
create type public.issue_severity as enum ('ok', 'warning', 'error');
create type public.print_orientation as enum ('flat', 'upright', 'tilted', 'as_is');
create type public.support_mode as enum ('none', 'auto', 'custom');
create type public.filament_material as enum ('PLA', 'PETG', 'ABS', 'TPU');

-- -----------------------------------------------------------------------------
-- 運営マスタ：フィラメント在庫
--   クリエイターは「自由記述の色」ではなく、ここにある在庫からしか選べない。
-- -----------------------------------------------------------------------------
create table public.filaments (
  id uuid primary key default gen_random_uuid(),
  material public.filament_material not null,
  color_name text not null,                       -- 例: ホワイト
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  stock_grams integer not null default 0 check (stock_grams >= 0),
  price_per_gram numeric(6,2) not null default 3.50,
  is_active boolean not null default true,        -- false で新規選択の候補から外す
  created_at timestamptz not null default now(),
  unique (material, color_name)
);

create index filaments_active_idx on public.filaments (is_active) where is_active;

comment on table public.filaments is '運営が保有するフィラメント在庫マスタ。作品の色指定はここからの選択制。';

-- -----------------------------------------------------------------------------
-- 運営マスタ：印刷代行費の単価とプリンタ制約
--   一律料金ではなく、材料量と造形時間から自動算出するための係数。
--   単価を変えても過去の注文金額が動かないよう、有効期間で世代管理する。
-- -----------------------------------------------------------------------------
create table public.print_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  effective_from timestamptz not null default now(),
  material_yen_per_gram numeric(6,2) not null default 3.50,
  machine_yen_per_hour numeric(7,2) not null default 75.00,
  handling_base_yen integer not null default 0,     -- 検品・梱包の基本料
  handling_per_part_yen integer not null default 20, -- 検品・梱包：パーツ1点あたり
  platform_fee_rate numeric(4,3) not null default 0.100 check (platform_fee_rate >= 0 and platform_fee_rate < 1),
  bed_x_mm integer not null default 220,
  bed_y_mm integer not null default 220,
  bed_z_mm integer not null default 250,
  max_batch_hours numeric(5,1) not null default 24.0, -- 1バッチの上限造形時間
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index print_pricing_rules_single_active_idx
  on public.print_pricing_rules (is_active) where is_active;

comment on table public.print_pricing_rules is '印刷代行費の単価とプリンタ制約。is_active の行が現在の計算に使われる。';

insert into public.print_pricing_rules (material_yen_per_gram, machine_yen_per_hour, handling_base_yen, handling_per_part_yen)
values (3.50, 75.00, 0, 20);

-- -----------------------------------------------------------------------------
-- 3Dデータ本体
--   STLは三角形座標しか持てず色を表現できないため、多色・複数パーツは3MFを推奨。
--   ファイル自体は非公開バケット（work-stl）に置き、購入者にも配布しない。
-- -----------------------------------------------------------------------------
create table public.work_assets (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  storage_path text not null,                     -- 非公開バケット内のパス
  file_name text not null,
  file_format public.model_file_format not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  unit text not null default 'mm',                -- 3MFの unit 属性。mm以外は検証で弾く
  object_count integer not null default 1 check (object_count > 0),
  triangle_count integer,
  vertex_count integer,
  -- 全オブジェクト合計（原寸）
  total_volume_cm3 numeric(10,2),
  total_surface_area_cm2 numeric(10,2),
  bbox_x_mm numeric(8,2),
  bbox_y_mm numeric(8,2),
  bbox_z_mm numeric(8,2),
  validation_status public.validation_status not null default 'pending',
  validated_at timestamptz,
  is_primary boolean not null default true,       -- 基準データ（サイズ展開の原寸）
  created_at timestamptz not null default now()
);

create index work_assets_work_id_idx on public.work_assets (work_id);
create unique index work_assets_one_primary_idx
  on public.work_assets (work_id) where is_primary;

comment on column public.work_assets.is_primary is 'サイズ展開の基準になるデータ。1作品につき1つ。';

-- -----------------------------------------------------------------------------
-- データ内の各オブジェクト（＝分割パーツ）
--   3MFなら1ファイルに複数入る。STLなら1件だけ。
-- -----------------------------------------------------------------------------
create table public.work_asset_objects (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.work_assets (id) on delete cascade,
  object_index integer not null,
  name text not null,
  triangle_count integer,
  bbox_x_mm numeric(8,2) not null,
  bbox_y_mm numeric(8,2) not null,
  bbox_z_mm numeric(8,2) not null,
  volume_cm3 numeric(10,2) not null,
  surface_area_cm2 numeric(10,2),
  -- 形状チェックの結果
  is_manifold boolean not null default true,
  open_edge_count integer not null default 0,
  flipped_normal_count integer not null default 0,
  self_intersection_count integer not null default 0,
  min_wall_thickness_mm numeric(6,2),
  created_at timestamptz not null default now(),
  unique (asset_id, object_index)
);

create index work_asset_objects_asset_id_idx on public.work_asset_objects (asset_id);

-- -----------------------------------------------------------------------------
-- 検証結果（画面のチェックリスト1行 = このテーブル1行）
-- -----------------------------------------------------------------------------
create table public.work_validation_issues (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.work_assets (id) on delete cascade,
  object_id uuid references public.work_asset_objects (id) on delete cascade,
  code text not null,                             -- manifold / normals / unit / thickness / bed_size / batch / colors
  severity public.issue_severity not null,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index work_validation_issues_asset_id_idx on public.work_validation_issues (asset_id);

-- -----------------------------------------------------------------------------
-- 色スロット：データの色定義 → 在庫フィラメントへの割り当て
--   3MFの basematerials を読み取り、スロットを自動生成する。
-- -----------------------------------------------------------------------------
create table public.work_color_slots (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  asset_id uuid not null references public.work_assets (id) on delete cascade,
  slot_index integer not null check (slot_index >= 1),
  source_name text not null,                      -- 3MF側の名前（例: White）
  source_hex text not null check (source_hex ~ '^#[0-9A-Fa-f]{6}$'),
  face_count integer,                             -- この色が割り当てられた三角形数
  filament_id uuid references public.filaments (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (asset_id, slot_index)
);

create index work_color_slots_work_id_idx on public.work_color_slots (work_id);

-- -----------------------------------------------------------------------------
-- パーツごとの印刷指示
--   「どう置いて刷るか」を運営が毎回考えずに済ませるための情報。
--   variant_id が NULL なら全サイズ共通、指定されていればそのサイズ専用の指示。
-- -----------------------------------------------------------------------------
create table public.work_part_instructions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  object_id uuid not null references public.work_asset_objects (id) on delete cascade,
  variant_id uuid,                                -- 後で work_variants を参照（下でFK追加）
  orientation public.print_orientation not null default 'flat',
  no_rotate boolean not null default false,       -- 「回転禁止」（寝かせ済みデータなど）
  support support_mode not null default 'none',
  support_note text,
  note text,
  created_at timestamptz not null default now()
);

create index work_part_instructions_work_id_idx on public.work_part_instructions (work_id);
create unique index work_part_instructions_unique_idx
  on public.work_part_instructions (object_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on column public.work_part_instructions.no_rotate is '寝かせた状態でデータ化されている等、運営が向きを変えてはいけない場合に true。';

-- -----------------------------------------------------------------------------
-- 組立情報
-- -----------------------------------------------------------------------------
create table public.work_assembly (
  work_id uuid primary key references public.works (id) on delete cascade,
  diagram_storage_path text,                      -- 組立図（画像 / PDF）
  fit_clearance_mm numeric(4,2),                  -- ほぞ等の片側クリアランス
  adhesive text,                                  -- 'none' / '瞬間接着剤' など
  steps_text text,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- サイズ展開（＝実際に売る単位）
--   価格・在庫・印刷代行費はすべてここが持つ。
--   体積は寸法の3乗で増えるため、代行費はサイズごとに再計算する。
-- -----------------------------------------------------------------------------
create table public.work_variants (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  size_label text not null,                       -- '10cm' / '15cm' / '20cm' / 'フリー'
  nui_size_cm numeric(4,1),                       -- 対応ぬいサイズ。検索の絞り込みに使う
  scale_ratio numeric(6,4) not null default 1.0 check (scale_ratio > 0),
  is_base boolean not null default false,         -- 原寸（scale_ratio = 1.0）
  asset_id uuid references public.work_assets (id) on delete restrict,
  -- ↑ NULL なら基準データをスケールして印刷。薄肉やほぞが等倍スケールに耐えない場合に
  --   サイズ専用データを差し替えられるようにしておく。

  -- スケール後の実寸（プリンタ制約の判定に使う）
  bbox_x_mm numeric(8,2),
  bbox_y_mm numeric(8,2),
  bbox_z_mm numeric(8,2),

  -- 自動算出される見積り
  est_filament_grams numeric(8,1),
  est_print_hours numeric(6,2),
  part_count integer not null default 1,
  batch_count integer not null default 1,          -- 造形時間から自動算出
  batch_count_override integer,                    -- ベッド面積の都合で分ける場合に運営が上書き
  print_fee_jpy integer,                          -- トリガで自動計算

  -- 出品条件
  price_jpy integer check (price_jpy is null or price_jpy >= 0),
  stock integer check (stock is null or stock >= 0),
  is_listed boolean not null default false,
  is_printable boolean not null default true,
  unprintable_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, size_label)
);

create index work_variants_work_id_idx on public.work_variants (work_id);
create index work_variants_listed_idx on public.work_variants (is_listed) where is_listed;
create index work_variants_nui_size_idx on public.work_variants (nui_size_cm);
create unique index work_variants_one_base_idx on public.work_variants (work_id) where is_base;

alter table public.work_part_instructions
  add constraint work_part_instructions_variant_id_fkey
  foreign key (variant_id) references public.work_variants (id) on delete cascade;

comment on table public.work_variants is 'サイズ展開。カート・注文が参照する「売る単位」。価格と在庫はここが持つ。';

-- -----------------------------------------------------------------------------
-- 見積り・代行費の自動計算
-- -----------------------------------------------------------------------------

-- 材料量の推定：外殻（表面積 × 殻厚）＋ 内部の充填率ぶん
create or replace function public.estimate_filament_grams(
  surface_area_cm2 numeric,
  volume_cm3 numeric,
  shell_cm numeric default 0.09,
  infill numeric default 0.15,
  density numeric default 1.24
) returns numeric
language sql immutable as $$
  select round(
    (least(surface_area_cm2 * shell_cm, volume_cm3)
     + greatest(volume_cm3 - least(surface_area_cm2 * shell_cm, volume_cm3), 0) * infill
    ) * density
  , 1);
$$;

comment on function public.estimate_filament_grams is
  '実データ（6パーツ・438g）との誤差 +5.2% で一致することを確認済みの推定式。';

-- 印刷代行費：材料費 ＋ 造形時間費 ＋ 検品梱包費
create or replace function public.calc_print_fee(
  grams numeric,
  hours numeric,
  parts integer
) returns integer
language plpgsql stable as $$
declare
  r public.print_pricing_rules;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な print_pricing_rules がありません';
  end if;
  return round(coalesce(grams, 0) * r.material_yen_per_gram)
       + round(coalesce(hours, 0) * r.machine_yen_per_hour)
       + r.handling_base_yen
       + r.handling_per_part_yen * greatest(coalesce(parts, 1), 1);
end;
$$;

-- variant 保存時に代行費・造形可否・バッチ数を再計算し、価格の下限を検証する
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

  -- ベッドに載るか（XYは入れ替えて判定）
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

  -- バッチ数：造形時間から自動算出し、ベッド面積の都合がある場合は上書きを優先
  if new.batch_count_override is not null then
    new.batch_count := greatest(new.batch_count_override, 1);
  elsif new.est_print_hours is not null then
    new.batch_count := greatest(ceil(new.est_print_hours / r.max_batch_hours)::integer, 1);
  end if;

  -- 価格の下限：代行費と手数料を回収できない価格は保存させない
  if new.is_listed and new.price_jpy is not null then
    floor_price := ceil(new.print_fee_jpy / (1 - r.platform_fee_rate))::integer;
    if new.price_jpy < floor_price then
      raise exception '販売価格 ¥% は下限 ¥% を下回っています（印刷代行費 ¥%、手数料率 % パーセント）',
        new.price_jpy, floor_price, new.print_fee_jpy, round(r.platform_fee_rate * 100);
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger sync_work_variant_before_write
  before insert or update on public.work_variants
  for each row execute function public.sync_work_variant();

-- クリエイターの受取額
create or replace function public.creator_payout_for(variant public.work_variants)
returns integer language plpgsql stable as $$
declare r public.print_pricing_rules;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  return variant.price_jpy - variant.print_fee_jpy - round(variant.price_jpy * r.platform_fee_rate);
end;
$$;

-- -----------------------------------------------------------------------------
-- works の整理：価格・在庫・STL・フィラメントは variant / asset 側へ移動
-- -----------------------------------------------------------------------------
alter table public.works drop column price;
alter table public.works drop column stock_limit;
alter table public.works drop column stl_storage_path;
alter table public.works drop column filament_material;
alter table public.works drop column filament_color;

alter table public.works add column accepts_color_change boolean not null default false;
alter table public.works add column accepts_mirror boolean not null default false;
alter table public.works add column accepts_stand_hole boolean not null default false;
alter table public.works add column accepts_custom_size boolean not null default false;
alter table public.works add column accepts_other_request boolean not null default false;

comment on table public.works is '作品の共通メタ。価格・在庫・印刷仕様は work_variants / work_assets が持つ。';

-- -----------------------------------------------------------------------------
-- カート・注文：works ではなく work_variants を参照する
-- -----------------------------------------------------------------------------
delete from public.cart_items; -- 参照先が works から work_variants に変わるため作り直す
alter table public.cart_items drop constraint cart_items_cart_id_work_id_key;
alter table public.cart_items drop column work_id;
alter table public.cart_items add column variant_id uuid not null references public.work_variants (id) on delete cascade;
alter table public.cart_items add constraint cart_items_cart_id_variant_id_key unique (cart_id, variant_id);

alter table public.order_items add column variant_id uuid references public.work_variants (id) on delete restrict;
alter table public.order_items add column size_label_snapshot text;
alter table public.order_items add column print_fee_snapshot integer;
alter table public.order_items add column color_slots_snapshot jsonb not null default '[]'::jsonb;
alter table public.order_items add column part_instructions_snapshot jsonb not null default '[]'::jsonb;

comment on column public.order_items.color_slots_snapshot is
  '注文時点の色スロット割り当て。フィラメント在庫が変わっても注文内容は動かさない。';
comment on column public.order_items.part_instructions_snapshot is
  '注文時点のパーツごとの積層方向・サポート指示。運営はこれを見て造形する。';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.filaments enable row level security;
alter table public.print_pricing_rules enable row level security;
alter table public.work_assets enable row level security;
alter table public.work_asset_objects enable row level security;
alter table public.work_validation_issues enable row level security;
alter table public.work_color_slots enable row level security;
alter table public.work_part_instructions enable row level security;
alter table public.work_assembly enable row level security;
alter table public.work_variants enable row level security;

-- フィラメント在庫・単価：誰でも読める（作品ページの表示に使う）／編集は運営のみ
create policy "filaments are readable by everyone"
  on public.filaments for select using (true);
create policy "filaments are writable by admin"
  on public.filaments for all using (public.is_admin()) with check (public.is_admin());

create policy "pricing rules are readable by everyone"
  on public.print_pricing_rules for select using (true);
create policy "pricing rules are writable by admin"
  on public.print_pricing_rules for all using (public.is_admin()) with check (public.is_admin());

-- 3Dデータのメタ情報：公開作品なら誰でも読める（ファイル本体は非公開バケット側で制御）
create policy "work assets readable when work is published"
  on public.work_assets for select using (
    exists (select 1 from public.works w where w.id = work_id
            and (w.status = 'published' or w.creator_id = auth.uid() or public.is_admin()))
  );
create policy "work assets writable by owner"
  on public.work_assets for all using (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

create policy "asset objects follow asset"
  on public.work_asset_objects for select using (
    exists (select 1 from public.work_assets a join public.works w on w.id = a.work_id
            where a.id = asset_id and (w.status = 'published' or w.creator_id = auth.uid() or public.is_admin()))
  );
create policy "asset objects writable by owner"
  on public.work_asset_objects for all using (
    exists (select 1 from public.work_assets a join public.works w on w.id = a.work_id
            where a.id = asset_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.work_assets a join public.works w on w.id = a.work_id
            where a.id = asset_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

-- 検証結果はクリエイター本人と運営のみ
create policy "validation issues for owner and admin"
  on public.work_validation_issues for all using (
    exists (select 1 from public.work_assets a join public.works w on w.id = a.work_id
            where a.id = asset_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.work_assets a join public.works w on w.id = a.work_id
            where a.id = asset_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

create policy "color slots readable when work is published"
  on public.work_color_slots for select using (
    exists (select 1 from public.works w where w.id = work_id
            and (w.status = 'published' or w.creator_id = auth.uid() or public.is_admin()))
  );
create policy "color slots writable by owner"
  on public.work_color_slots for all using (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

-- 印刷指示は運営とクリエイター本人だけが見る（購入者には見せない）
create policy "part instructions for owner and admin"
  on public.work_part_instructions for all using (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

create policy "assembly for owner and admin"
  on public.work_assembly for all using (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  );

-- サイズ展開：出品中のものは誰でも読める
create policy "listed variants are readable by everyone"
  on public.work_variants for select using (
    is_listed or exists (select 1 from public.works w where w.id = work_id
                         and (w.creator_id = auth.uid() or public.is_admin()))
  );
create policy "variants writable by owner"
  on public.work_variants for all using (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_admin()))
  );


-- -----------------------------------------------------------------------------
-- 画面用ビュー：価格の下限と受取額をまとめて返す
--   STEP1・STEP3 の「サイズ展開」テーブル、作品詳細のサイズセレクタが参照する。
-- -----------------------------------------------------------------------------
create or replace view public.work_variant_pricing as
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
  ceil(v.print_fee_jpy / (1 - r.platform_fee_rate))::integer as min_price_jpy,
  case when v.price_jpy is null then null
       else v.price_jpy - v.print_fee_jpy - round(v.price_jpy * r.platform_fee_rate)::integer
  end as creator_payout_jpy
from public.work_variants v
cross join lateral (select * from public.print_pricing_rules where is_active limit 1) r;

comment on view public.work_variant_pricing is
  'サイズ展開に価格下限とクリエイター受取額を付与したビュー。';

-- -----------------------------------------------------------------------------
-- 初期データ：在庫フィラメント
-- -----------------------------------------------------------------------------
insert into public.filaments (material, color_name, color_hex, stock_grams) values
  ('PLA',  'ホワイト',   '#F7F5F0', 12000),
  ('PLA',  'ブラック',   '#424045',  8000),
  ('PLA',  'グレー',     '#9AA3AF',  5000),
  ('PLA',  'レッド',     '#E5484D',  3000),
  ('PLA',  'ブルー',     '#2F80ED',  3000),
  ('PLA',  'グリーン',   '#3FA96A',  2500),
  ('PLA',  'ピンク',     '#F48FB1',  2500),
  ('PLA',  'シルバー',   '#C0C4CC',  2000),
  ('PETG', 'ホワイト',   '#F7F5F0',  4000),
  ('PETG', '生成り',     '#EFE7D8',  3000);

insert into public.filaments (material, color_name, color_hex, stock_grams, is_active) values
  ('PLA', 'ゴールド', '#C9A227', 0, false),
  ('PLA', 'クリア',   '#E8F1F8', 0, false);

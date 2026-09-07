-- =============================================================================
-- 0007_variant_part_bbox.sql
--
-- ベッドに載るかどうかの判定を「組み立て後の大きさ」から
-- 「一番大きいパーツ単体の大きさ」に直す。
--
-- 背景：
--   実データ（6パーツのジオラマ）を検証パイプラインに通したところ、
--   work_variants.bbox_* に入れていたのは組み立て後の外接直方体だった。
--   ところが分割パーツはバラバラに印刷するので、ベッド制約にかかるのは
--   組み立て後の寸法ではなく個々のパーツの寸法になる。
--   組み立て後で判定すると、実際には刷れる作品まで出品不可になってしまう。
--
--   そこで最大パーツの寸法を別に持ち、印刷可否はそちらで判定する。
--   bbox_* は引き続き「作品の大きさ」として画面表示に使う。
-- =============================================================================

alter table public.work_variants add column max_part_bbox_x_mm numeric(8,2);
alter table public.work_variants add column max_part_bbox_y_mm numeric(8,2);
alter table public.work_variants add column max_part_bbox_z_mm numeric(8,2);
alter table public.work_variants add column oversized_parts text[] not null default '{}';

comment on column public.work_variants.max_part_bbox_x_mm is
  '一番大きいパーツ単体の寸法。ベッド判定はこちらを使う（bbox_* は組み立て後の表示用）。';
comment on column public.work_variants.oversized_parts is
  'ベッドに載らないパーツ名。空でなければ is_printable=false。';

create or replace function public.sync_work_variant() returns trigger
language plpgsql as $$
declare
  r public.print_pricing_rules;
  floor_price integer;
  fit_x numeric;
  fit_y numeric;
  fit_z numeric;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な print_pricing_rules がありません';
  end if;

  new.print_fee_jpy := public.calc_print_fee(new.est_filament_grams, new.est_print_hours, new.part_count);

  -- 最大パーツの寸法があればそれで、なければ従来どおり作品全体の寸法で判定する
  fit_x := coalesce(new.max_part_bbox_x_mm, new.bbox_x_mm);
  fit_y := coalesce(new.max_part_bbox_y_mm, new.bbox_y_mm);
  fit_z := coalesce(new.max_part_bbox_z_mm, new.bbox_z_mm);

  if fit_x is not null and fit_y is not null then
    if (greatest(fit_x, fit_y) > greatest(r.bed_x_mm, r.bed_y_mm))
       or (least(fit_x, fit_y) > least(r.bed_x_mm, r.bed_y_mm))
       or (coalesce(fit_z, 0) > r.bed_z_mm) then
      new.is_printable := false;
      new.unprintable_reason := format(
        '%sが %s×%s×%s mm でベッド上限 %s×%s×%s mm を超過',
        case when array_length(new.oversized_parts, 1) is null
             then '造形サイズ'
             else 'パーツ「' || new.oversized_parts[1] || '」' end,
        round(fit_x, 1), round(fit_y, 1), round(fit_z, 1),
        r.bed_x_mm, r.bed_y_mm, r.bed_z_mm);
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

-- ビューにも最大パーツ寸法を出す（STEP1・STEP3のサイズ展開テーブル用）
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
  v.max_part_bbox_x_mm, v.max_part_bbox_y_mm, v.max_part_bbox_z_mm,
  v.oversized_parts,
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
  'サイズ展開に価格下限・購入者総額・クリエイター受取額を付与したビュー。ベッド判定は最大パーツ寸法で行う。';

-- =============================================================================
-- 0016_settlement_actual_cost.sql
--
-- 精算を「実費」で行う（運営の指示 2026-09-08）:
--
--   手数料 = (購入者の支払い − 印刷の実費 − 送料の実費) × 料率（20%）
--   クリエイター受取 = 残り
--
-- 0015 では「印刷にかかった金額」を請求した印刷代行費（見込み）で読んでいたが、
-- 実際にかかった金額（使ったフィラメント・印刷時間・配送業者に払った送料）で
-- 精算する。実費は印刷が終わって発送するまで確定しないので、
--
--   発送前  … 見込み（請求した代行費・購入者負担の送料で仮計算）
--   発送後  … 確定（実費で計算）
--
-- の2段で見せる。出品時にクリエイターへ見せる受取額（work_variant_pricing）は
-- 見込みのまま（代行費 = 実費の見込みなので、作品代金 × 80% に一致する）。
-- 実費と見込みの差は 80/20 でクリエイターと運営が分け合う形になる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 料率は注文ごとにスナップショットする
--    あとで料率を変えても、過去の注文の精算が動かないようにするため。
-- -----------------------------------------------------------------------------
alter table public.orders
  add column platform_fee_rate numeric(4,3)
  check (platform_fee_rate >= 0 and platform_fee_rate < 1);

comment on column public.orders.platform_fee_rate is
  '注文時の運営手数料率。print_pricing_rules から写す（トリガー）。精算はこの率で行う。';

create or replace function public.snapshot_order_fee_rate() returns trigger
language plpgsql as $$
begin
  if new.platform_fee_rate is null then
    select platform_fee_rate into new.platform_fee_rate
      from public.print_pricing_rules where is_active limit 1;
  end if;
  return new;
end;
$$;

create trigger orders_snapshot_fee_rate
  before insert on public.orders
  for each row execute function public.snapshot_order_fee_rate();

update public.orders o
   set platform_fee_rate = r.platform_fee_rate
  from public.print_pricing_rules r
 where r.is_active and o.platform_fee_rate is null;

-- -----------------------------------------------------------------------------
-- 2. 注文の印刷実費
--    ジョブの実績（実使用グラム・実印刷時間）から出す。材料費は台帳に消費が
--    あればそのフィラメントの単価で、無ければ料金表の単価で。
--    実績が入っていないジョブが1つでもあれば null（＝まだ確定できない）。
-- -----------------------------------------------------------------------------
create or replace function public.order_actual_print_cost(p_order_id uuid)
returns integer
language plpgsql stable as $$
declare
  r public.print_pricing_rules;
  j record;
  material_cost numeric;
  total numeric := 0;
  job_count integer := 0;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then return null; end if;

  for j in
    select id, actual_filament_grams, actual_print_hours, part_count, quantity
      from public.print_jobs
     where order_id = p_order_id and status <> 'cancelled'
  loop
    job_count := job_count + 1;
    if j.actual_filament_grams is null or j.actual_print_hours is null then
      return null;
    end if;

    -- 台帳に「印刷で消費」があれば、実際に使ったフィラメントの単価で
    select sum(-l.delta_grams * f.price_per_gram)
      into material_cost
      from public.filament_ledger l
      join public.filaments f on f.id = l.filament_id
     where l.print_job_id = j.id and l.reason = 'print';

    if material_cost is null then
      material_cost := j.actual_filament_grams * r.material_yen_per_gram;
    end if;

    total := total
      + round(material_cost)
      + round(j.actual_print_hours * r.machine_yen_per_hour)
      + r.handling_base_yen
      + r.handling_per_part_yen * greatest(j.part_count, 1) * greatest(j.quantity, 1);
  end loop;

  if job_count = 0 then return null; end if;
  return total::integer;
end;
$$;

comment on function public.order_actual_print_cost(uuid) is
  '注文の印刷実費（材料・機械時間・検品梱包）。実績未入力のジョブがあれば null。';

-- -----------------------------------------------------------------------------
-- 3. 精算ビュー
--    売上・手数料の画面と運営の注文詳細が読む。金額の式はここだけが持つ。
-- -----------------------------------------------------------------------------
create view public.order_settlements as
with base as (
  select
    o.id as order_id,
    o.status,
    o.created_at as ordered_at,
    o.buyer_id,
    o.platform_fee_rate,
    o.total_amount        as gross_amount,             -- 購入者の支払い
    o.subtotal_amount     as goods_amount,             -- 作品代金
    o.print_cost_amount   as print_fee_amount,         -- 請求した印刷代行費（見込み）
    o.shipping_fee_amount as shipping_charged_amount,  -- 購入者負担の送料（見込み）
    public.order_actual_print_cost(o.id) as print_actual_amount,
    s.shipping_fee_jpy    as shipping_actual_amount,
    s.shipped_at
  from public.orders o
  left join public.shipments s on s.order_id = o.id
),
used as (
  select
    base.*,
    (print_actual_amount is not null and shipped_at is not null) as is_final,
    coalesce(print_actual_amount, print_fee_amount)          as print_cost_used,
    coalesce(shipping_actual_amount, shipping_charged_amount) as shipping_used
  from base
),
pooled as (
  select
    used.*,
    gross_amount - print_cost_used - shipping_used as pool_amount
  from used
)
select
  pooled.*,
  -- 手数料。差引がマイナスなら運営は取らない（受取がマイナスになる注文は画面で目立たせる）
  greatest(round(pool_amount * platform_fee_rate)::integer, 0) as fee_amount,
  pool_amount - greatest(round(pool_amount * platform_fee_rate)::integer, 0) as payout_amount
from pooled;

alter view public.order_settlements set (security_invoker = on);

comment on view public.order_settlements is
  '注文ごとの精算。発送済みなら実費で確定（is_final）、それまでは請求額で見込み。手数料 = (支払い − 印刷実費 − 送料実費) × 料率。';

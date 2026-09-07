-- =============================================================================
-- 0015_fee_rule_and_shipping.sql
--
-- 手数料の決め方を運営の指示に合わせる（2026-09-08）:
--
--   「印刷にかかった金額と送料を、売れた金額から引いて、その残りに 20% の手数料」
--
--   購入者が払う金額 = 作品代金 + 印刷代行費 + 送料
--   印刷代行費と送料は運営の実費回収ぶん（fee_billing = 'separate'。0006 で決めた）なので、
--   これを引いた残り＝作品代金 に 20% をかけたものが手数料、80% がクリエイターの受取。
--
--   この式は work_variant_pricing（受取額の表示）・出品フロー STEP3・注文時の
--   スナップショット（order_items.platform_fee_amount / creator_payout_amount）が
--   すべて platform_fee_rate を読んで動くので、料率を変えれば揃う。
--   過去の注文はスナップショットのまま（さかのぼって書き換えない）。
--
-- あわせて「送料」を注文に持たせる。orders には送料の列が無く、購入者が払った
-- 合計に送料を含められなかった（発送記録の shipping_fee_jpy は運営が払った実費）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 手数料率 10% → 20%
-- -----------------------------------------------------------------------------
update public.print_pricing_rules
   set platform_fee_rate = 0.200
 where is_active;

comment on column public.print_pricing_rules.platform_fee_rate is
  '運営手数料の率。購入者の支払いから印刷代行費と送料を引いた残り（＝作品代金）にかける。既定 20%。';

-- -----------------------------------------------------------------------------
-- 2. 購入者が払う送料を注文に持つ
--    total_amount = subtotal_amount + print_cost_amount + shipping_fee_amount
--    shipments.shipping_fee_jpy（運営が配送業者に払った実費）とは別物。
-- -----------------------------------------------------------------------------
alter table public.orders
  add column shipping_fee_amount integer not null default 0
  check (shipping_fee_amount >= 0);

comment on column public.orders.shipping_fee_amount is
  '購入者が払った送料。決済時に確定する。運営の実費は shipments.shipping_fee_jpy。';
comment on column public.orders.total_amount is
  '購入者の支払い合計 = subtotal_amount（作品代金）+ print_cost_amount（印刷代行費）+ shipping_fee_amount（送料）。';

-- =============================================================================
-- 0019_creator_sales_payouts.sql
--
-- クリエイターの売上ダッシュボードと払込のための器。
--
--   1. クリエイターは自分の作品が入った注文を読める（進み具合と精算を見せるため）
--   2. 明細ごとの精算ビュー（注文の精算を作品代金の割合で配る）
--   3. クリエイターごとの受取残高（確定した受取 − 再印刷の負担 − 申請済み）
--   4. 払込: 運営が口座を読み、申請を処理できる。振込完了で通知
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 自分の作品が入った注文はクリエイターも読める
--    orders に個人情報は無い（住所は addresses で別に守られている）。
-- -----------------------------------------------------------------------------
-- order_items のポリシーが orders を参照しているので、orders 側から order_items を
-- 素直に見ると無限再帰になる。RLS を通さない definer 関数で判定する。
create or replace function public.order_has_creator_items(p_order_id uuid, p_creator_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items oi
     where oi.order_id = p_order_id and oi.creator_id = p_creator_id
  );
$$;

create policy "creators view orders containing their items"
  on public.orders for select
  using (public.order_has_creator_items(id, auth.uid()));

-- 発送記録も同じ範囲で読める（精算の「確定」と実費の送料に要る。追跡番号は購入者にも出ているもの）
create policy "shipments readable by item creator"
  on public.shipments for select
  using (public.order_has_creator_items(order_id, auth.uid()));

-- 印刷実費の計算は台帳（運営専用）を読む。クリエイターが精算を見るときも同じ値になるよう
-- definer にする（返すのは注文ごとの合計金額だけ）。
alter function public.order_actual_print_cost(uuid) security definer;
alter function public.order_actual_print_cost(uuid) set search_path = public;

-- -----------------------------------------------------------------------------
-- 2. 明細ごとの精算
--    注文の精算（order_settlements）は注文単位なので、明細には作品代金の割合で配る。
--    四捨五入で注文合計と ±1 円ずれることがある（残高は注文単位の値で出すので影響しない）。
-- -----------------------------------------------------------------------------
create view public.creator_item_settlements as
select
  oi.id as item_id,
  oi.order_id,
  oi.creator_id,
  oi.work_id,
  oi.variant_id,
  oi.size_label_snapshot,
  oi.quantity,
  oi.unit_price * oi.quantity as goods_amount,
  oi.creator_payout_amount as payout_estimate,      -- 注文時の見込み（作品代金 × 80%）
  s.status,
  s.ordered_at,
  s.shipped_at,
  s.is_final,
  round(s.fee_amount * (oi.unit_price * oi.quantity)::numeric / nullif(s.goods_amount, 0))::integer as fee_amount,
  round(s.payout_amount * (oi.unit_price * oi.quantity)::numeric / nullif(s.goods_amount, 0))::integer as payout_amount,
  w.title as work_title,
  (select wi.storage_path from public.work_images wi where wi.work_id = oi.work_id order by wi.sort_order limit 1) as thumbnail_path
from public.order_items oi
join public.order_settlements s on s.order_id = oi.order_id
left join public.works w on w.id = oi.work_id;

alter view public.creator_item_settlements set (security_invoker = on);

comment on view public.creator_item_settlements is
  '明細ごとの精算。注文の精算を作品代金の割合で配ったもの。is_final が true なら実費で確定。';

-- -----------------------------------------------------------------------------
-- 3. クリエイターの受取残高
--    受取可能額 = 確定した受取（発送済み・取引完了） − 再印刷の負担 − 申請済み（申請中・処理中・振込済み）
--    見込み（未発送）は別に出す。
-- -----------------------------------------------------------------------------
create view public.creator_payout_balances as
with items as (
  select creator_id,
         sum(payout_amount) filter (where is_final and status in ('shipped', 'completed')) as settled_payout,
         sum(payout_amount) filter (where not (is_final and status in ('shipped', 'completed'))
                                      and status in ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed')) as pending_payout,
         count(*) filter (where status in ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed')) as sold_items
    from public.creator_item_settlements
   group by creator_id
),
charges as (
  select creator_id, sum(reprint_fee_jpy) as reprint_charges
    from public.revision_requests
   where charged_to_creator and status <> 'cancelled'
   group by creator_id
),
requested as (
  select creator_id,
         sum(amount) filter (where status in ('requested', 'processing')) as requested_amount,
         sum(amount) filter (where status = 'paid') as paid_amount
    from public.payout_requests
   group by creator_id
)
select
  p.id as creator_id,
  coalesce(i.settled_payout, 0)::integer   as settled_payout,
  coalesce(i.pending_payout, 0)::integer   as pending_payout,
  coalesce(i.sold_items, 0)::integer       as sold_items,
  coalesce(c.reprint_charges, 0)::integer  as reprint_charges,
  coalesce(r.requested_amount, 0)::integer as requested_amount,
  coalesce(r.paid_amount, 0)::integer      as paid_amount,
  (coalesce(i.settled_payout, 0) - coalesce(c.reprint_charges, 0)
     - coalesce(r.requested_amount, 0) - coalesce(r.paid_amount, 0))::integer as available_amount
from public.profiles p
left join items i on i.creator_id = p.id
left join charges c on c.creator_id = p.id
left join requested r on r.creator_id = p.id
where p.role in ('creator', 'admin');

alter view public.creator_payout_balances set (security_invoker = on);

comment on view public.creator_payout_balances is
  'クリエイターの受取残高。available_amount = 確定受取 − 再印刷の負担 − 申請中・処理中 − 振込済み。';

-- -----------------------------------------------------------------------------
-- 4. 払込の処理
-- -----------------------------------------------------------------------------
-- 運営は口座を読める（振込作業のため。書き換えは本人だけ）
create policy "payout accounts readable by admin"
  on public.payout_accounts for select
  using (public.is_admin());

-- 運営は申請の状態を進められる（既存ポリシーの with check が本人限定で、運営の update が通らなかった）
create policy "payout requests processed by admin"
  on public.payout_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- 申請は残高の範囲内でしか出せない（画面の検査に頼らない）
create or replace function public.check_payout_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_available integer;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.payout_accounts a where a.creator_id = new.creator_id) then
      raise exception '振込先口座が登録されていません';
    end if;
    select available_amount into v_available
      from public.creator_payout_balances where creator_id = new.creator_id;
    if new.amount > coalesce(v_available, 0) then
      raise exception '申請額 ¥% が受取可能額 ¥% を超えています', new.amount, coalesce(v_available, 0);
    end if;
    if new.amount < 1000 then
      raise exception '振込の申請は ¥1,000 から受け付けています';
    end if;
  end if;
  return new;
end;
$$;

create trigger payout_requests_check
  before insert on public.payout_requests
  for each row execute function public.check_payout_request();

-- 振込完了・却下はクリエイターに通知（設計判断2: 通知はトリガーだけが出す）
create or replace function public.notify_on_payout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    perform public.push_notification(
      new.creator_id, 'creator',
      '振込が完了しました',
      '¥' || to_char(new.amount, 'FM999,999,999') || ' を振り込みました',
      '/studio/payouts', 'payout_requests', new.id);
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    perform public.push_notification(
      new.creator_id, 'creator',
      '振込の申請が差し戻されました',
      '¥' || to_char(new.amount, 'FM999,999,999') || ' の申請を確認してください',
      '/studio/payouts', 'payout_requests', new.id);
  end if;
  return null;
end;
$$;

create trigger payout_requests_notify
  after update of status on public.payout_requests
  for each row execute function public.notify_on_payout();

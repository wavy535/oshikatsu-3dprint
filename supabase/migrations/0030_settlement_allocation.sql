-- 端数は明細ID順の累積額の差分で配る。明細の合計を注文の精算額に一致させる。
-- RLS適用後の明細だけで計算すると、複数クリエイターの注文で配分が変わってしまう。
-- 注文全体で計算した後、呼び出し元に見せられる明細の金額だけを返す。
create function public.order_item_settlement_amounts(p_order_id uuid)
returns table (item_id uuid, fee_amount integer, payout_amount integer)
language sql stable security definer set search_path = '' as $$
  with weights as (
    select oi.id, oi.creator_id,
      case when sum(oi.unit_price::numeric * oi.quantity) over () = 0 then 1
           else oi.unit_price::numeric * oi.quantity end as weight
    from public.order_items oi where oi.order_id = p_order_id
  ), shares as materialized (
    select *, sum(weight) over (order by id rows unbounded preceding) as through,
              sum(weight) over () as total
    from weights
  )
  select i.id,
    (round(s.fee_amount * i.through / i.total) - round(s.fee_amount * (i.through - i.weight) / i.total))::integer,
    (round(s.payout_amount * i.through / i.total) - round(s.payout_amount * (i.through - i.weight) / i.total))::integer
  from shares i cross join public.order_settlements s
  where s.order_id = p_order_id
    and (auth.role() = 'service_role' or public.is_admin()
         or s.buyer_id = auth.uid() or i.creator_id = auth.uid());
$$;
revoke execute on function public.order_item_settlement_amounts(uuid) from public, anon;
grant execute on function public.order_item_settlement_amounts(uuid) to authenticated, service_role;

create or replace view public.creator_item_settlements with (security_invoker = on) as
select
  oi.id as item_id, oi.order_id, oi.creator_id, oi.work_id, oi.variant_id,
  oi.size_label_snapshot, oi.quantity,
  oi.unit_price * oi.quantity as goods_amount,
  oi.creator_payout_amount as payout_estimate,
  s.status, s.ordered_at, s.shipped_at, s.is_final,
  amounts.fee_amount, amounts.payout_amount,
  w.title as work_title,
  (select wi.storage_path from public.work_images wi where wi.work_id = oi.work_id order by wi.sort_order limit 1) as thumbnail_path,
  p.display_name as creator_name
from public.order_items oi
join public.order_settlements s on s.order_id = oi.order_id
join lateral public.order_item_settlement_amounts(oi.order_id) amounts on amounts.item_id = oi.id
left join public.works w on w.id = oi.work_id
left join public.profiles p on p.id = oi.creator_id;

comment on view public.creator_item_settlements is
  '注文単位の精算額を明細ID順の累積比率で按分。手数料・受取額の合計は注文の額と一致する。';

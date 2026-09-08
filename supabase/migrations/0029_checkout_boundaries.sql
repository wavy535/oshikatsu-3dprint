-- 決済を開始した注文はStripeのSessionと結び付け、再試行でも同じ決済を使う。
alter table public.orders
  add column checkout_started_at timestamptz,
  add column stripe_checkout_session_id text unique;

-- 注文作成は金額・明細を検査するplace_order経由に限定する。
drop policy if exists "buyers create own orders" on public.orders;
revoke insert on public.orders from anon, authenticated;

create function public.begin_order_checkout(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if auth.uid() is null or not found or o.buyer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'この注文を操作できません';
  end if;
  if o.status <> 'payment_pending' then
    raise exception '支払い待ちの注文ではありません';
  end if;
  update public.orders set checkout_started_at = coalesce(checkout_started_at, now())
    where id = o.id returning * into o;
  return o;
end;
$$;
revoke execute on function public.begin_order_checkout(uuid) from public, anon, service_role;
grant execute on function public.begin_order_checkout(uuid) to authenticated;

create or replace function public.cancel_unpaid_order(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  is_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  if not is_service and auth.uid() is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if not is_service and o.buyer_id is distinct from auth.uid() and not public.is_admin() then
    raise exception using errcode = '42501', message = 'この注文を取り消す権限がありません';
  end if;
  if o.status <> 'payment_pending' then return false; end if;
  -- Session作成中も含む。サーバーでStripe側の失効・失敗を確認してから取り消す。
  if o.checkout_started_at is not null and not is_service then
    raise exception using errcode = '42501', message = '決済状況を確認してから取り消してください';
  end if;
  update public.orders set status = 'cancelled', updated_at = now() where id = o.id;
  insert into public.order_status_history (order_id, status, note, changed_by)
    values (o.id, 'cancelled', '未払い注文の取消', coalesce(auth.uid(), o.buyer_id));
  return true;
end;
$$;

-- 署名済みイベント、またはサーバーがStripeへ照会したSessionだけを受け取る。
-- 注文・Session・金額・状態の検査と更新を同じロック内で行う。
create function public.apply_stripe_checkout(
  p_order_id uuid, p_session_id text, p_amount_total integer,
  p_currency text, p_paid boolean, p_payment_ref text default null
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception '注文が見つかりません'; end if;
  if p_session_id is null or p_session_id = '' or p_paid is null
     or p_currency is distinct from 'jpy' or p_amount_total is distinct from o.total_amount then
    raise exception '決済の金額・通貨・Sessionが注文と一致しません';
  end if;
  if o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id <> p_session_id then
    raise exception '別の決済Sessionが指定されました';
  end if;
  if p_paid and (p_payment_ref is null or p_payment_ref = '') then
    raise exception '支払い参照がありません';
  end if;
  if p_paid and o.status <> 'payment_pending' then
    if o.stripe_payment_intent_id = p_payment_ref then return false; end if;
    raise exception 'この注文には支払いを反映できません';
  end if;
  update public.orders
    set stripe_checkout_session_id = p_session_id,
        checkout_started_at = coalesce(checkout_started_at, now())
    where id = o.id;
  if p_paid then
    return public.confirm_order_payment(o.id, p_payment_ref);
  end if;
  return public.cancel_unpaid_order(o.id);
end;
$$;
revoke execute on function public.apply_stripe_checkout(uuid, text, integer, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_checkout(uuid, text, integer, text, boolean, text)
  to service_role;

-- 注文作成単体の関数はデモ注文RPCの内部処理に限定する。
revoke execute on function public.place_order(uuid, text) from authenticated;

-- 現段階の注文は実課金なし。外部決済を開始するAPIは公開しない。
revoke execute on function public.begin_order_checkout(uuid) from authenticated;
revoke execute on function public.apply_stripe_checkout(uuid, text, integer, text, boolean, text) from service_role;

alter table public.orders
  add column is_demo boolean not null default false,
  add column checkout_request_id uuid,
  add constraint orders_buyer_checkout_request_key unique (buyer_id, checkout_request_id);

-- 以前の未確定注文も、本人が明示的にデモ注文として確定できる。
-- 外部決済を開始した履歴がある注文には触れない。
create function public.confirm_demo_order(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if auth.uid() is null or not found or o.buyer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'この注文を操作できません';
  end if;
  if o.checkout_started_at is not null or o.stripe_checkout_session_id is not null then
    raise exception '外部決済の履歴があるため、運営へお問い合わせください';
  end if;
  if o.status <> 'payment_pending' then return false; end if;
  update public.orders set is_demo = true where id = o.id;
  return public.confirm_order_payment(o.id, 'demo-' || o.id::text);
end;
$$;
revoke execute on function public.confirm_demo_order(uuid) from public, anon, service_role;
grant execute on function public.confirm_demo_order(uuid) to authenticated;

-- 作成・確定・カート消去・印刷ジョブ作成は同じトランザクション。
-- 応答が届かず再送された場合は、同じ注文IDを返す。
create function public.place_demo_order(p_address_id uuid, p_request_id uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_order_id uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;
  if p_request_id is null or length(p_note) > 500 then
    raise exception '注文の入力内容が不正です';
  end if;
  -- 同じ購入者の同時注文を直列化し、カートを二度確定しない。
  perform 1 from public.carts where user_id = v_user for update;
  select id into v_order_id from public.orders
    where buyer_id = v_user and checkout_request_id = p_request_id;
  if found then return v_order_id; end if;

  -- 在庫の確認から減算まで、購入するバリアントをID順にロックする。
  perform v.id from public.work_variants v
    join public.cart_items ci on ci.variant_id = v.id
    join public.carts c on c.id = ci.cart_id
    where c.user_id = v_user order by v.id for update of v;
  v_order_id := public.place_order(p_address_id, p_note);
  update public.orders set checkout_request_id = p_request_id where id = v_order_id;
  perform public.confirm_demo_order(v_order_id);
  return v_order_id;
end;
$$;
revoke execute on function public.place_demo_order(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.place_demo_order(uuid, uuid, text) to authenticated;

-- ============================================================
-- 0013: 注文まわり RPC
-- DESIGN.md §7.1/§7.3、§8.3(orders の RLS コメント)準拠。
--
-- orders は buyer 向けの INSERT/UPDATE ポリシーを意図的に持たない
-- （0008 のコメント参照）。そのため注文作成・決済確定・キャンセルは
-- すべて SECURITY DEFINER 関数（0007 で先送りしていたもの）で行う。
--
-- create_pending_order / cancel_order は auth.uid() が非NULLの場合
-- （＝実ユーザーセッションからの呼び出し）のみ本人確認を行う。
-- auth.uid() が NULL（＝service_role からの呼び出し = Webhook）の
-- 場合はスキップする（Webhook 側で Stripe 署名検証済みのため）。
-- ============================================================

-- ─────────────────────────────────────────────
-- create_pending_order : カートから注文を作成（DESIGN.md §7.1 ①②）
--   価格・公開状態はクライアントの申告を信用せず、サーバー側で
--   cart_items を再読込して都度計算する。
-- ─────────────────────────────────────────────
create or replace function public.create_pending_order(
  p_buyer_id uuid,
  p_address_id uuid,
  p_shipping_fee integer
) returns table(order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal integer;
  v_total integer;
  v_addr record;
  v_item record;
begin
  if auth.uid() is not null and p_buyer_id <> auth.uid() then
    raise exception '権限がありません';
  end if;

  select * into v_addr from public.shipping_addresses
    where id = p_address_id and user_id = p_buyer_id and deleted_at is null;
  if not found then
    raise exception '配送先が見つかりません';
  end if;

  if not exists (select 1 from public.cart_items where user_id = p_buyer_id) then
    raise exception 'カートが空です';
  end if;

  if exists (
    select 1 from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = p_buyer_id and (p.status <> 'published' or p.deleted_at is not null)
  ) then
    raise exception '販売終了した作品がカートに含まれています';
  end if;

  select coalesce(sum((p.base_price + f.surcharge) * ci.quantity), 0)
    into v_subtotal
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  join public.filaments f on f.id = ci.filament_id
  where ci.user_id = p_buyer_id;

  v_total := v_subtotal + p_shipping_fee;

  insert into public.orders (
    buyer_id, subtotal, shipping_fee, total,
    ship_recipient_name, ship_postal_code, ship_prefecture, ship_city,
    ship_address_line1, ship_address_line2, ship_phone
  ) values (
    p_buyer_id, v_subtotal, p_shipping_fee, v_total,
    v_addr.recipient_name, v_addr.postal_code, v_addr.prefecture, v_addr.city,
    v_addr.address_line1, v_addr.address_line2, v_addr.phone
  ) returning id into v_order_id;

  for v_item in
    select
      ci.product_id, ci.quantity, p.title as product_title, p.creator_id,
      (select pi.image_url from public.product_images pi
        where pi.product_id = p.id order by pi.sort_order limit 1) as image_url,
      ci.filament_id, f.name as filament_name, f.color_hex as filament_color_hex, f.surcharge,
      ci.nui_size_id, ns.label as nui_size_label,
      p.base_price,
      coalesce(cp.commission_rate, 0.300) as commission_rate
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.filaments f on f.id = ci.filament_id
    left join public.nui_sizes ns on ns.id = ci.nui_size_id
    left join public.creator_profiles cp on cp.user_id = p.creator_id
    where ci.user_id = p_buyer_id
  loop
    insert into public.order_items (
      order_id, product_id, creator_id,
      product_title, product_image_url,
      filament_id, filament_name, filament_color_hex,
      nui_size_id, nui_size_label,
      unit_price, quantity, line_total,
      commission_rate, creator_revenue
    ) values (
      v_order_id, v_item.product_id, v_item.creator_id,
      v_item.product_title, v_item.image_url,
      v_item.filament_id, v_item.filament_name, v_item.filament_color_hex,
      v_item.nui_size_id, v_item.nui_size_label,
      v_item.base_price + v_item.surcharge, v_item.quantity,
      (v_item.base_price + v_item.surcharge) * v_item.quantity,
      v_item.commission_rate,
      round((v_item.base_price + v_item.surcharge) * v_item.quantity * (1 - v_item.commission_rate))
    );
  end loop;

  return query select v_order_id;
end;
$$;

-- ─────────────────────────────────────────────
-- mark_order_paid : Webhook（checkout.session.completed）から呼ぶ。
--   注文確定 + カート削除 + 注文スレッド生成を1トランザクションで行う
--   （DESIGN.md §7.3）。event.id の冪等化は呼び出し側(stripe_events)で
--   行うが、本関数自体も対象外なら何もしない形で冪等にしておく。
-- ─────────────────────────────────────────────
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_intent_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_creator_id uuid;
begin
  select buyer_id into v_buyer_id
    from public.orders where id = p_order_id and status = 'pending_payment';
  if not found then
    return;
  end if;

  update public.orders set
    status = 'paid',
    paid_at = now(),
    stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id, reason)
  values (p_order_id, 'pending_payment', 'paid', null, 'stripe_webhook');

  delete from public.cart_items where user_id = v_buyer_id;

  for v_creator_id in
    select distinct creator_id from public.order_items where order_id = p_order_id
  loop
    insert into public.message_threads (kind, buyer_id, creator_id, order_id)
    values ('order', v_buyer_id, v_creator_id, p_order_id)
    on conflict (order_id, creator_id) where order_id is not null do nothing;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────
-- cancel_order : Webhook（checkout.session.expired）と
--   購入者の requestCancel の両方から呼ぶ（printing 開始前のみ）。
-- ─────────────────────────────────────────────
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status public.order_status;
begin
  select status into v_old_status from public.orders where id = p_order_id;
  if not found then
    return;
  end if;

  if auth.uid() is not null
     and not (
       public.is_admin()
       or exists (select 1 from public.orders where id = p_order_id and buyer_id = auth.uid())
     ) then
    raise exception '権限がありません';
  end if;

  if v_old_status not in ('pending_payment', 'paid') then
    return;
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id, reason)
  values (p_order_id, v_old_status, 'cancelled', auth.uid(), p_reason);
end;
$$;

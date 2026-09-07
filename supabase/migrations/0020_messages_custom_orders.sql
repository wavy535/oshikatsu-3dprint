-- =============================================================================
-- 0020_messages_custom_orders.sql
--
-- 相談系（メッセージ／オーダーメイド）を画面から動かすための差分。
--
--   1. 通知の行き先を実装した画面に合わせる（/mypage/messages, /mypage/custom-orders）
--   2. 見積りの承認・辞退を買う人が呼べる関数にする（accept_custom_quote は
--      クリエイター所有の作品・サイズを作るので、買う人の権限では通らなかった）
--   3. 承認した見積りのサイズ（非公開・1点）を、その買う人だけがカートに入れて決済できる
--   4. 承認・辞退・注文はクリエイターに通知
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 通知の行き先
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.sender_id;
  perform public.push_notification(
    new.recipient_id, 'message',
    coalesce(v_name, 'ユーザー') || ' さんからメッセージが届きました',
    left(new.body, 60),
    '/mypage/messages?with=' || new.sender_id::text,
    'messages', new.id);
  return null;
end;
$$;

create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_name text;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    perform public.push_notification(
      new.buyer_id, 'message',
      'オーダーメイドの見積りが届きました',
      coalesce(new.quote_no, '見積り')
        || ' ／ 合計 ¥'
        || to_char(new.price_jpy + new.print_fee_jpy + new.shipping_fee_jpy, 'FM999,999')
        || ' ／ 有効期限 ' || to_char(new.expires_at, 'MM月DD日'),
      '/mypage/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  elsif tg_op = 'UPDATE' and new.status in ('accepted', 'declined', 'ordered') and old.status is distinct from new.status then
    select display_name into v_creator_name from public.profiles where id = new.buyer_id;
    perform public.push_notification(
      new.creator_id, 'creator',
      case new.status
        when 'accepted' then '見積りが承認されました'
        when 'ordered'  then 'オーダーメイドが注文されました'
        else '見積りが辞退されました'
      end,
      coalesce(new.quote_no, '見積り') || ' ／ ' || coalesce(v_creator_name, '購入者') || ' さん',
      '/studio/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. 見積りの承認・辞退（買う人が呼ぶ）
-- -----------------------------------------------------------------------------
create or replace function public.accept_custom_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q public.custom_order_quotes;
  v_id uuid;
  w_id uuid;
begin
  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then raise exception '見積りが見つかりません'; end if;
  if q.buyer_id <> auth.uid() then raise exception 'この見積りを承認できるのは依頼した本人だけです'; end if;
  if q.status <> 'sent' then raise exception '提示中の見積りではありません（%）', q.status; end if;
  if q.expires_at < now() then
    update public.custom_order_quotes set status = 'expired' where id = p_quote_id;
    raise exception 'この見積りは有効期限を過ぎています';
  end if;

  -- ベース作品がなければ、この見積り専用の作品を1つ作る（下書きのまま。公開はしない）
  w_id := q.base_work_id;
  if w_id is null then
    insert into public.works (creator_id, title, description, status)
    values (q.creator_id, 'オーダーメイド ' || q.quote_no, coalesce(q.note, ''), 'draft')
    returning id into w_id;
  end if;

  -- 買う人専用のサイズ。is_listed = false のまま（他の人の作品ページには出ない）
  insert into public.work_variants (
    work_id, size_label, scale_ratio, asset_id,
    max_part_bbox_x_mm, max_part_bbox_y_mm, max_part_bbox_z_mm,
    est_filament_grams, est_print_hours, part_count,
    price_jpy, stock, is_listed
  ) values (
    w_id, 'オーダーメイド ' || q.quote_no, 1.0, q.asset_id,
    q.max_part_bbox_x_mm, q.max_part_bbox_y_mm, q.max_part_bbox_z_mm,
    q.est_filament_grams, q.est_print_hours, q.part_count,
    q.price_jpy, 1, false
  ) returning id into v_id;

  update public.custom_order_quotes
     set status = 'accepted', variant_id = v_id, accepted_at = now(), updated_at = now()
   where id = p_quote_id;

  update public.custom_order_requests set status = 'accepted' where id = q.request_id;

  -- そのままカートへ
  insert into public.cart_items (cart_id, variant_id, quantity)
  select c.id, v_id, 1 from public.carts c where c.user_id = q.buyer_id
  on conflict (cart_id, variant_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.decline_custom_quote(p_quote_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  q public.custom_order_quotes;
begin
  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then return false; end if;
  if q.buyer_id <> auth.uid() then raise exception 'この見積りを辞退できるのは依頼した本人だけです'; end if;
  if q.status <> 'sent' then return false; end if;
  update public.custom_order_quotes set status = 'declined', updated_at = now() where id = p_quote_id;
  return true;
end;
$$;

grant execute on function public.accept_custom_quote(uuid) to authenticated;
grant execute on function public.decline_custom_quote(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. 承認済みの見積りのサイズは、その買う人だけが買える
-- -----------------------------------------------------------------------------
create or replace function public.variant_reserved_for(p_variant_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.custom_order_quotes q
     where q.variant_id = p_variant_id and q.buyer_id = p_user_id and q.status in ('accepted', 'ordered')
  );
$$;

grant execute on function public.variant_reserved_for(uuid, uuid) to authenticated;

-- 買う人は自分の見積りのサイズを読める（is_listed = false でも）
create policy "reserved variants readable by their buyer"
  on public.work_variants for select
  using (public.variant_reserved_for(id, auth.uid()));

-- works 側のポリシーから work_variants を直接見ると、work_variants のポリシーが works を
-- 参照していて再帰になる。definer 関数で判定する
create or replace function public.work_reserved_for(p_work_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.custom_order_quotes q
    join public.work_variants v on v.id = q.variant_id
     where v.work_id = p_work_id and q.buyer_id = p_user_id and q.status in ('accepted', 'ordered')
  );
$$;

grant execute on function public.work_reserved_for(uuid, uuid) to authenticated;

create policy "works with reserved variants readable by their buyer"
  on public.works for select
  using (public.work_reserved_for(id, auth.uid()));

-- place_order: 公開・出品中でなくても、自分の承認済み見積りのサイズなら通す
create or replace function public.place_order(p_address_id uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rule public.print_pricing_rules;
  v_order_id uuid;
  v_subtotal integer := 0;
  v_print integer := 0;
  v_fee integer := 0;
  v_count integer := 0;
  l record;
begin
  if v_user is null then
    raise exception 'ログインが必要です';
  end if;
  if not exists (select 1 from public.addresses a where a.id = p_address_id and a.user_id = v_user) then
    raise exception 'お届け先が見つかりません';
  end if;

  select * into v_rule from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な料金表がありません';
  end if;

  for l in
    select ci.quantity, p.*, w.title, w.status as work_status, w.creator_id,
           public.variant_reserved_for(p.id, v_user) as reserved
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
      join public.work_variant_pricing p on p.id = ci.variant_id
      join public.works w on w.id = p.work_id
     where c.user_id = v_user
  loop
    if not l.reserved and (l.work_status <> 'published' or not l.is_listed) then
      raise exception '「%」は現在購入できません', l.title;
    end if;
    if not l.is_printable then
      raise exception '「%」（%）は造形できないサイズです', l.title, l.size_label;
    end if;
    if l.stock is not null and l.stock < l.quantity then
      raise exception '「%」（%）の在庫が足りません（残り %）', l.title, l.size_label, l.stock;
    end if;
    if l.price_jpy is null or l.buyer_total_jpy is null then
      raise exception '「%」（%）の価格が決まっていません', l.title, l.size_label;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'カートが空です';
  end if;

  insert into public.orders (
    buyer_id, status, subtotal_amount, platform_fee_amount, print_cost_amount,
    shipping_fee_amount, total_amount, shipping_address_id
  ) values (v_user, 'payment_pending', 0, 0, 0, v_rule.shipping_fee_jpy, 0, p_address_id)
  returning id into v_order_id;

  insert into public.order_items (
    order_id, work_id, creator_id, variant_id, size_label_snapshot,
    unit_price, quantity, creator_payout_amount, platform_fee_amount,
    print_cost_amount, print_fee_snapshot,
    stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot,
    color_slots_snapshot, part_instructions_snapshot
  )
  select
    v_order_id, p.work_id, w.creator_id, p.id, p.size_label,
    p.price_jpy, ci.quantity,
    p.creator_payout_jpy * ci.quantity,
    (p.price_jpy - p.creator_payout_jpy) * ci.quantity,
    p.print_fee_jpy * ci.quantity, p.print_fee_jpy,
    coalesce((select a.storage_path from public.work_assets a where a.work_id = p.work_id and a.is_primary limit 1), ''),
    coalesce((select f.material::text from public.work_color_slots cs join public.filaments f on f.id = cs.filament_id
               where cs.work_id = p.work_id order by cs.slot_index limit 1), '未指定'),
    coalesce((select f.color_name from public.work_color_slots cs join public.filaments f on f.id = cs.filament_id
               where cs.work_id = p.work_id order by cs.slot_index limit 1), '未指定'),
    coalesce((select jsonb_agg(jsonb_build_object(
                'slot_index', cs.slot_index, 'source_name', cs.source_name,
                'material', f.material, 'color_name', f.color_name, 'color_hex', f.color_hex)
                order by cs.slot_index)
              from public.work_color_slots cs
              left join public.filaments f on f.id = cs.filament_id
              where cs.work_id = p.work_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'part', o.name, 'orientation', pi.orientation, 'support', pi.support,
                'support_note', pi.support_note, 'note', pi.note)
                order by o.object_index)
              from public.work_part_instructions pi
              join public.work_asset_objects o on o.id = pi.object_id
              where pi.work_id = p.work_id and (pi.variant_id is null or pi.variant_id = p.id)), '[]'::jsonb)
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  join public.work_variant_pricing p on p.id = ci.variant_id
  join public.works w on w.id = p.work_id
  where c.user_id = v_user;

  select sum(unit_price * quantity), sum(print_cost_amount), sum(platform_fee_amount)
    into v_subtotal, v_print, v_fee
    from public.order_items where order_id = v_order_id;

  update public.orders
     set subtotal_amount = v_subtotal,
         print_cost_amount = v_print,
         platform_fee_amount = v_fee,
         total_amount = v_subtotal + v_print + v_rule.shipping_fee_jpy
   where id = v_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order_id, 'payment_pending', p_note, v_user);

  return v_order_id;
end;
$$;

-- confirm_order_payment: オーダーメイドの見積りは「注文済み」に
create or replace function public.confirm_order_payment(p_order_id uuid, p_payment_ref text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '注文が見つかりません';
  end if;
  if v_order.status <> 'payment_pending' then
    return false;
  end if;

  update public.orders
     set status = 'paid',
         stripe_payment_intent_id = coalesce(p_payment_ref, stripe_payment_intent_id),
         updated_at = now()
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'paid', p_payment_ref, v_order.buyer_id);

  update public.work_variants v
     set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi
   where oi.order_id = p_order_id and v.id = oi.variant_id and v.stock is not null;

  delete from public.cart_items ci
   using public.carts c, public.order_items oi
   where ci.cart_id = c.id and c.user_id = v_order.buyer_id
     and oi.order_id = p_order_id and oi.variant_id = ci.variant_id;

  update public.custom_order_quotes q
     set status = 'ordered', ordered_at = now(), updated_at = now()
    from public.order_items oi
   where oi.order_id = p_order_id and q.variant_id = oi.variant_id and q.status = 'accepted';

  perform public.create_print_jobs_for_order(p_order_id);

  return true;
end;
$$;

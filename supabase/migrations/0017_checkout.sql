-- =============================================================================
-- 0017_checkout.sql
--
-- 決済（チェックアウト）の器。注文の作成と支払い確定を DB 関数にまとめる。
--
-- 背景：
--   order_items には買う人向けの insert ポリシーが無く、print_jobs は運営専用。
--   注文の作成〜支払い確定はアプリから1テーブルずつ書けるものではないので、
--   security definer の関数にして「カートから注文を起こす」「支払いが済んだら
--   確定する」の2つを DB 側に置く。金額はここで work_variant_pricing から
--   写す（計算はDBに寄せる）。
--
--   place_order(住所, 要望)        … カート → orders(payment_pending) + order_items
--   confirm_order_payment(注文, 参照) … paid にして在庫を引き、カートを空にし、
--                                   印刷ジョブを作る（create_print_jobs_for_order）
--   cancel_unpaid_order(注文)      … 支払われなかった注文を取り消す
--
--   決済プロバイダ（Stripe）を挟むかどうかはアプリの都合なので、DB は知らない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 送料は料金表に持つ（今は全国一律。地域別にするならここを表にする）
-- -----------------------------------------------------------------------------
alter table public.print_pricing_rules
  add column shipping_fee_jpy integer not null default 520 check (shipping_fee_jpy >= 0);

comment on column public.print_pricing_rules.shipping_fee_jpy is
  '購入者に請求する送料（全国一律）。決済時に orders.shipping_fee_amount へ写す。';

-- -----------------------------------------------------------------------------
-- 2. 販売通知は「支払いが済んだとき」に出す
--    0010 では order_items の insert で出していたが、決済前に注文行を作るように
--    なったので、未払いの注文でクリエイターに「売れました」が飛んでしまう。
-- -----------------------------------------------------------------------------
drop trigger if exists order_items_notify_sale on public.order_items;

create or replace function public.notify_on_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i record;
begin
  if new.status = 'paid' and old.status = 'payment_pending' then
    for i in
      select oi.creator_id, oi.quantity, oi.creator_payout_amount, oi.id, w.title
        from public.order_items oi
        left join public.works w on w.id = oi.work_id
       where oi.order_id = new.id
    loop
      perform public.push_notification(
        i.creator_id, 'creator',
        '作品が売れました',
        coalesce(i.title, '作品') || ' ×' || i.quantity
          || ' ／ 受取（見込み） ¥' || to_char(i.creator_payout_amount, 'FM999,999'),
        '/studio',
        'order_items', i.id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger orders_notify_sale
  after update of status on public.orders
  for each row execute function public.notify_on_sale();

-- -----------------------------------------------------------------------------
-- 3. カートから注文を起こす（支払い前）
-- -----------------------------------------------------------------------------
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

  -- カートの中身を検査してから注文を起こす。買えないものが1つでもあれば全体を止める
  for l in
    select ci.quantity, p.*, w.title, w.status as work_status, w.creator_id
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
      join public.work_variant_pricing p on p.id = ci.variant_id
      join public.works w on w.id = p.work_id
     where c.user_id = v_user
  loop
    if l.work_status <> 'published' or not l.is_listed then
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

  -- 明細。金額は work_variant_pricing の値を注文時点のスナップショットとして写す。
  -- 色スロットと印刷指示も写しておく（あとでクリエイターが作品を直しても注文は動かない）
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

comment on function public.place_order(uuid, text) is
  'カートの中身から支払い前の注文を作る。買えないものがあれば例外で止める。返り値は注文ID。';

-- -----------------------------------------------------------------------------
-- 4. 支払い確定
--    決済プロバイダの成功を受けて呼ぶ。二重に呼ばれても安全（paid でなければ何もしない）。
-- -----------------------------------------------------------------------------
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

  -- 在庫を引く（null は無制限）。売り越しは止めずに 0 で止める（運営が気づけるように）
  update public.work_variants v
     set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi
   where oi.order_id = p_order_id and v.id = oi.variant_id and v.stock is not null;

  -- 買ったものはカートから消す
  delete from public.cart_items ci
   using public.carts c, public.order_items oi
   where ci.cart_id = c.id and c.user_id = v_order.buyer_id
     and oi.order_id = p_order_id and oi.variant_id = ci.variant_id;

  -- 印刷ジョブを起こす（注文は printing_queued へ進む）
  perform public.create_print_jobs_for_order(p_order_id);

  return true;
end;
$$;

comment on function public.confirm_order_payment(uuid, text) is
  '支払い完了を反映する。paid → 在庫引き → カート掃除 → 印刷ジョブ生成。冪等。';

-- -----------------------------------------------------------------------------
-- 5. 支払われなかった注文の取り消し（本人か運営）
-- -----------------------------------------------------------------------------
create or replace function public.cancel_unpaid_order(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if v_order.buyer_id <> auth.uid() and not public.is_admin() then
    raise exception 'この注文を取り消す権限がありません';
  end if;
  if v_order.status <> 'payment_pending' then return false; end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'cancelled', '支払い前に取り消し', auth.uid());
  return true;
end;
$$;

-- 買う人が自分の注文の関数を呼べるように
grant execute on function public.place_order(uuid, text) to authenticated;
grant execute on function public.cancel_unpaid_order(uuid) to authenticated;
-- 支払い確定はサーバー（service role）だけが呼ぶ
revoke execute on function public.confirm_order_payment(uuid, text) from public, anon, authenticated;

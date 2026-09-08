-- 更新系 RPC の認可境界を明示する。
-- SECURITY DEFINER は RLS を迂回するため、EXECUTE 権限と本人確認を両方持つ。
-- 「対象者 <> auth.uid()」は未ログイン時に NULL となり、拒否条件を通過していた。
-- 過去のマイグレーションは変更せず、既存環境にもこの差分を適用する。

create or replace function public.cancel_unpaid_order(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_user uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  -- 署名検証済みの決済 webhook は利用者の JWT を持たない。
  -- NULL の副作用に頼らず、service_role の権限として明示的に許可する。
  if v_user is null and not v_service then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if not v_service and v_order.buyer_id is distinct from v_user and not public.is_admin() then
    raise exception 'この注文を取り消す権限がありません' using errcode = '42501';
  end if;
  if v_order.status <> 'payment_pending' then return false; end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'cancelled', '支払い前に取り消し', v_user);
  return true;
end;
$$;

comment on function public.cancel_unpaid_order(uuid) is
  '未払い注文を本人・運営・決済サーバーだけが取り消せる。確定済み・取消済みは変更しない。';

create or replace function public.accept_custom_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.custom_order_quotes;
  v_user uuid := auth.uid();
  v_id uuid;
  w_id uuid;
begin
  if v_user is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then raise exception '見積りが見つかりません'; end if;
  if q.buyer_id is distinct from v_user then
    raise exception 'この見積りを承認できるのは依頼した本人だけです' using errcode = '42501';
  end if;
  if q.status <> 'sent' then raise exception '提示中の見積りではありません（%）', q.status; end if;
  if q.expires_at < now() then
    update public.custom_order_quotes set status = 'expired' where id = p_quote_id;
    raise exception 'この見積りは有効期限を過ぎています';
  end if;

  -- 専用作品・サイズ・カートの作成は既存のトランザクション内で完結させる。
  w_id := q.base_work_id;
  if w_id is null then
    insert into public.works (creator_id, title, description, status)
    values (q.creator_id, 'オーダーメイド ' || q.quote_no, coalesce(q.note, ''), 'draft')
    returning id into w_id;
  end if;

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

  insert into public.cart_items (cart_id, variant_id, quantity)
  select c.id, v_id, 1 from public.carts c where c.user_id = q.buyer_id
  on conflict (cart_id, variant_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.decline_custom_quote(p_quote_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  q public.custom_order_quotes;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then return false; end if;
  if q.buyer_id is distinct from v_user then
    raise exception 'この見積りを辞退できるのは依頼した本人だけです' using errcode = '42501';
  end if;
  if q.status <> 'sent' then return false; end if;
  update public.custom_order_quotes set status = 'declined', updated_at = now() where id = p_quote_id;
  return true;
end;
$$;

-- authenticated への GRANT だけでは、既定の PUBLIC / anon 権限は消えない。
revoke execute on function public.place_order(uuid, text) from public, anon, service_role;
grant execute on function public.place_order(uuid, text) to authenticated;

revoke execute on function public.cancel_unpaid_order(uuid) from public, anon;
grant execute on function public.cancel_unpaid_order(uuid) to authenticated, service_role;

revoke execute on function public.accept_custom_quote(uuid) from public, anon, service_role;
grant execute on function public.accept_custom_quote(uuid) to authenticated;

revoke execute on function public.decline_custom_quote(uuid) from public, anon, service_role;
grant execute on function public.decline_custom_quote(uuid) to authenticated;

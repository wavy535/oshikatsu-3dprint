-- ============================================================
-- 0007: 権限判定ヘルパー関数 & ガードトリガ
-- DESIGN.md §8.2 / §8.3 準拠
--
-- ここに含まれるのは「スキーマの一部として RLS ポリシーが直接依存する関数」
-- のみ。checkout/admin/payout の業務ロジック RPC（mark_order_paid,
-- cancel_order, refund_order, create_product_with_relations 等）は、
-- それらを呼び出す Server Action を実装するフェーズ（決済/作品投稿/精算）で
-- 併せて追加する。
-- ============================================================

-- ① Admin 判定：JWT の app_metadata.role を見る（profiles を読まないので再帰しない）
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ② クリエイター判定（承認済み）
create or replace function public.is_approved_creator(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_profiles
    where user_id = uid and status = 'approved'
  );
$$;

-- ③ 作品の所有者判定
create or replace function public.owns_product(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products
    where id = pid and creator_id = auth.uid()
  );
$$;

-- ④ 注文の購入者判定
create or replace function public.owns_order(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders where id = oid and buyer_id = auth.uid()
  );
$$;

-- ⑤ スレッド参加者判定
create or replace function public.is_thread_member(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.message_threads
    where id = tid and (buyer_id = auth.uid() or creator_id = auth.uid())
  );
$$;

-- ─────────────────────────────────────────────
-- profiles.role → auth.users.raw_app_meta_data.role の同期
-- ─────────────────────────────────────────────
create or replace function public.sync_role_to_jwt()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.role is distinct from old.role then
    update auth.users
      set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
      where id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_sync_role
  after update of role on public.profiles
  for each row execute function public.sync_role_to_jwt();

-- ★ role / is_creator の自己昇格を防ぐ
create or replace function public.guard_profile_privilege()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_creator is distinct from old.is_creator then
      raise exception '権限フィールドは変更できません';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_privilege
  before update on public.profiles
  for each row execute function public.guard_profile_privilege();

-- ★ 審査を通さず published にできてしまう穴を塞ぐ
create or replace function public.guard_product_status()
returns trigger language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if new.status is distinct from old.status then
    if not (
      (old.status in ('draft','rejected') and new.status = 'in_review')
      or new.status = 'archived'
      or (old.status = 'archived' and new.status = 'draft')
    ) then
      raise exception '許可されていないステータス遷移です: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
create trigger products_guard_status
  before update on public.products
  for each row execute function public.guard_product_status();

-- ★ orders.status の不正な遷移・受取確認の権限を防ぐ
create or replace function public.guard_order_status()
returns trigger language plpgsql as $$
declare allowed boolean;
begin
  if current_setting('role', true) = 'service_role' then return new; end if;
  if new.status = old.status then return new; end if;

  allowed := case
    when old.status = 'paid'     and new.status in ('printing','cancelled','refunded') then true
    when old.status = 'printing' and new.status in ('shipped','cancelled','refunded')  then true
    when old.status = 'shipped'  and new.status in ('completed','refunded')            then true
    when old.status = 'pending_payment' and new.status in ('paid','cancelled')         then true
    else false
  end;

  if not allowed then
    raise exception '不正なステータス遷移: % -> %', old.status, new.status;
  end if;

  if new.status = 'completed'
     and not (public.is_admin() or old.buyer_id = auth.uid()) then
    raise exception '受取確認は購入者本人のみ可能です';
  end if;
  return new;
end $$;
create trigger orders_guard_status
  before update on public.orders
  for each row execute function public.guard_order_status();

-- ★ クリエイターが返信欄以外を書き換えるのを防ぐ
create or replace function public.guard_review_columns()
returns trigger language plpgsql as $$
begin
  if public.is_admin() or new.user_id = auth.uid() then return new; end if;
  if new.rating is distinct from old.rating
     or new.body is distinct from old.body
     or new.title is distinct from old.title
     or new.is_public is distinct from old.is_public then
    raise exception 'レビュー本文は変更できません';
  end if;
  new.creator_replied_at := now();
  return new;
end $$;
create trigger reviews_guard_columns
  before update on public.reviews
  for each row execute function public.guard_review_columns();

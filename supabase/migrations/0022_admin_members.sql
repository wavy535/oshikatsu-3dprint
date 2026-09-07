-- =============================================================================
-- 0022_admin_members.sql
--
-- 引き継ぎ書 3.5「次に必要なもの」の 4（運営メンバーの追加）。
--
--  1. profiles.role の防護 … 「自分のプロフィールは自分で更新できる」ポリシーに列の
--                            制限が無く、一般ユーザーが自分の role を admin に書き換え
--                            られた（psql で再現済み）。役割の変更は運営だけに絞る。
--  2. 運営メンバーの追加・解除 … これまで SQL で role を立てる以外の手段が無かった。
-- =============================================================================

-- =============================================================================
-- 1. profiles.role の防護
--
-- security invoker のトリガーにする。definer にすると current_user が常に関数の
-- 所有者（postgres）になり、誰が更新しているのか分からなくなる。
-- 承認トリガー（0004）や下の grant/revoke は definer 関数の中から更新するので
-- current_user = postgres となり素通りする。PostgREST 経由（authenticated）で
-- 役割を変えられるのは運営だけ。
-- =============================================================================
create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not public.is_admin() then
    raise exception 'role は運営だけが変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.guard_profile_role() is
  'profiles.role を一般ユーザーが自分で書き換えるのを止める（自己昇格の防止）。';

create trigger guard_profile_role
  before update of role on public.profiles
  for each row execute function public.guard_profile_role();

-- =============================================================================
-- 2. 運営メンバーの追加・解除
--
-- どちらも運営だけが呼べる。追加は「登録済みのユーザー」をメールアドレスで指す
-- （招待メールを送る仕組みは持たない。先に普通に会員登録してもらう）。
-- 解除で戻す役割は、上げたときに控えた role_before_admin。控えが無ければ（SQL で直接
-- admin にした人）、承認済みのクリエイター申請があれば creator、なければ buyer。
-- =============================================================================
alter table public.profiles add column role_before_admin public.user_role;
comment on column public.profiles.role_before_admin is
  '運営メンバーに上げる前の役割。解除したときにここへ戻す。運営でない人は null。';

create or replace function public.list_admin_members()
returns table (id uuid, display_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role = 'admin'
     order by p.created_at;
end;
$$;

create or replace function public.grant_admin(p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;

  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;
  if v_id is null then
    raise exception 'そのメールアドレスで登録されたユーザーが見つかりません';
  end if;

  select role into v_role from public.profiles where id = v_id;
  if v_role = 'admin' then
    raise exception 'すでに運営メンバーです';
  end if;

  update public.profiles set role = 'admin', role_before_admin = v_role where id = v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_next public.user_role;
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;
  -- 呼び手は運営で、自分は解除できない。だから解除後も運営は必ず1人以上残る
  -- （「最後の1人」の検査はこれで兼ねる）。
  if p_user_id = auth.uid() then
    raise exception '自分自身は解除できません（他の運営メンバーに頼んでください）';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'そのユーザーは運営メンバーではありません';
  end if;

  select coalesce(
           p.role_before_admin,
           case when exists (
                  select 1 from public.creator_applications
                   where user_id = p_user_id and status = 'approved')
                then 'creator'::public.user_role
                else 'buyer'::public.user_role end)
    into v_next
    from public.profiles p where p.id = p_user_id;

  update public.profiles
     set role = v_next, role_before_admin = null
   where id = p_user_id and role = 'admin';
  if not found then
    raise exception 'そのユーザーは運営メンバーではありません';
  end if;
end;
$$;

comment on function public.grant_admin(text) is
  '登録済みユーザーをメールアドレスで指して運営メンバーに上げる。運営だけが呼べる。';
comment on function public.revoke_admin(uuid) is
  '運営メンバーを解除して上げる前の役割に戻す。自分自身は解除できない（運営が0人にはならない）。';

grant execute on function public.list_admin_members() to authenticated;
grant execute on function public.grant_admin(text) to authenticated;
grant execute on function public.revoke_admin(uuid) to authenticated;

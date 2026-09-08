-- =============================================================================
-- クリエイター申請に SMS 認証と利用規約への同意を必須にする
--
-- ・電話番号の確認そのものは Supabase Auth（auth.users.phone / phone_confirmed_at）が持つ。
--   アプリは updateUser({ phone }) でコードを送り、verifyOtp(type='phone_change') で確認する。
-- ・申請行には「そのとき確認済みだった番号」と「同意した規約のバージョン」を写しておく
--   （あとで番号を変えても、審査時に何を見たかが残る）。
-- ・アプリを経由せず PostgREST から直接 insert しても抜けられないよう、
--   トリガーで auth.users を見て未認証なら拒否する。auth スキーマは一般ユーザーから読めないので
--   security definer にする（書き込み先は creator_applications の new 行だけ）。
-- =============================================================================

alter table public.creator_applications
  add column phone text,
  add column phone_verified_at timestamptz,
  add column terms_version text,
  add column terms_agreed_at timestamptz,
  add column portfolio_url text;

comment on column public.creator_applications.phone is
  '申請時点で SMS 認証済みだった電話番号（E.164）。トリガーが auth.users から写す';
comment on column public.creator_applications.phone_verified_at is
  'その番号を認証した時刻（auth.users.phone_confirmed_at の写し）';
comment on column public.creator_applications.terms_version is
  '同意したクリエイター利用規約のバージョン（例 2026-09-08）。未同意なら申請できない';
comment on column public.creator_applications.terms_agreed_at is
  '同意した時刻。トリガーが now() を入れるのでアプリは渡さない';
comment on column public.creator_applications.portfolio_url is
  'SNS やポートフォリオの URL（任意）';

alter table public.creator_applications
  add constraint creator_applications_portfolio_url_check
  check (portfolio_url is null or portfolio_url ~* '^https?://');

create or replace function public.guard_creator_application_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_confirmed timestamptz;
begin
  if new.terms_version is null or length(trim(new.terms_version)) = 0 then
    raise exception 'terms_not_agreed'
      using hint = 'クリエイター利用規約への同意が必要です';
  end if;

  select u.phone, u.phone_confirmed_at
    into v_phone, v_confirmed
    from auth.users u
   where u.id = new.user_id;

  if v_phone is null or v_confirmed is null then
    raise exception 'phone_not_verified'
      using hint = 'SMS で電話番号の認証を済ませてください';
  end if;

  -- アプリが何を渡してきても、認証済みの値で上書きする
  new.phone := v_phone;
  new.phone_verified_at := v_confirmed;
  new.terms_agreed_at := now();
  return new;
end;
$$;

comment on function public.guard_creator_application_insert() is
  'クリエイター申請の insert 前に、SMS 認証済みと規約同意を検査し、番号と同意時刻を写す';

create trigger guard_creator_application_insert
  before insert on public.creator_applications
  for each row
  execute function public.guard_creator_application_insert();

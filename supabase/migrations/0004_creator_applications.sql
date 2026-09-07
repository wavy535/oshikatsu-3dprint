-- =============================================================================
-- クリエイター申請・審査ロジック（role: buyer → creator）
-- ・購入者（buyer）は creator_applications に申請を1件作成できる
-- ・保留中（pending）の申請は同時に1件まで（部分ユニークインデックス）
-- ・運営（Admin, Service Role経由）が承認/却下すると、
--   承認時のみトリガーで profiles.role が 'creator' に自動更新される
-- =============================================================================

create type public.creator_application_status as enum ('pending', 'approved', 'rejected');

create table public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.creator_application_status not null default 'pending',
  message text not null, -- 申請理由・活動内容など
  admin_note text, -- 却下理由等、運営からのコメント
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.creator_applications is 'buyer→creatorへのロール変更申請。承認されると handle_creator_application_approval トリガーが profiles.role を更新する';

create index creator_applications_user_id_idx on public.creator_applications (user_id);
create index creator_applications_status_idx on public.creator_applications (status);

-- 同一ユーザーが同時に複数のpending申請を作れないようにする
create unique index creator_applications_one_pending_per_user
  on public.creator_applications (user_id)
  where (status = 'pending');

-- ---------------------------------------------------------------------------
-- 承認時に profiles.role を 'creator' に更新するトリガー
-- ---------------------------------------------------------------------------
create function public.handle_creator_application_approval() returns trigger as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.profiles
    set role = 'creator'
    where id = new.user_id
      and role = 'buyer'; -- 既にcreator/adminの場合は上書きしない

    new.reviewed_at = coalesce(new.reviewed_at, now());
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_creator_application_status_change
  before update on public.creator_applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.handle_creator_application_approval();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.creator_applications enable row level security;

create policy "users view own applications"
  on public.creator_applications for select
  using (auth.uid() = user_id or public.is_admin());

create policy "buyers submit creator applications"
  on public.creator_applications for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'buyer'
    )
  );

-- 通常ユーザーによる更新は不可。審査（承認/却下）は運営が
-- createServiceRoleClient() 経由（RLSバイパス）でのみ行う設計。
create policy "only admin updates applications"
  on public.creator_applications for update
  using (public.is_admin())
  with check (public.is_admin());

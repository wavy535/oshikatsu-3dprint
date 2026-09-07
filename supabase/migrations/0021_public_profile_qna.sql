-- =============================================================================
-- 0021_public_profile_qna.sql
--
-- 公開プロフィール・レビュー一覧・Q&A のための差分。
--
--   1. フォローは誰でも数えられる（フォロワー数を公開プロフィールに出す）
--   2. 公開プロフィールの数字（作品数・フォロワー・販売実績・評価）を1関数で出す。
--      販売実績は order_items（買う人と本人だけ読める）から出すので definer にする
--   3. Q&A の通知（質問 → クリエイター、回答 → 質問した人）。設計判断2どおりトリガーで
--   4. レビュー通知の行き先を公開プロフィールに合わせる
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. フォローの読み取りは公開（誰が誰をフォローしているかは公開情報として扱う）
-- -----------------------------------------------------------------------------
create policy "follows are publicly viewable"
  on public.creator_follows for select
  using (true);

-- -----------------------------------------------------------------------------
-- 2. 公開プロフィールの数字
-- -----------------------------------------------------------------------------
create or replace function public.creator_public_stats(p_creator_id uuid)
returns table (
  works_count integer,
  follower_count integer,
  sold_count integer,
  review_count integer,
  avg_rating numeric
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.works w where w.creator_id = p_creator_id and w.status = 'published')::integer,
    (select count(*) from public.creator_follows f where f.creator_id = p_creator_id)::integer,
    (select coalesce(sum(oi.quantity), 0)
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
      where oi.creator_id = p_creator_id
        and o.status in ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed'))::integer,
    (select count(*) from public.reviews r where r.creator_id = p_creator_id)::integer,
    (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.creator_id = p_creator_id);
$$;

grant execute on function public.creator_public_stats(uuid) to anon, authenticated;

comment on function public.creator_public_stats(uuid) is
  '公開プロフィールの見出しに出す数字。販売実績は支払い済み以降の注文の点数。';

-- -----------------------------------------------------------------------------
-- 3. Q&A の通知
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_question() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator uuid;
  v_title text;
begin
  select creator_id, title into v_creator, v_title from public.works where id = new.work_id;
  if v_creator is null or v_creator = new.asker_id then return null; end if;
  perform public.push_notification(
    v_creator, 'creator',
    '作品に質問が届きました',
    coalesce(v_title, '作品') || ' ／ ' || left(new.question, 60),
    '/works/' || new.work_id::text || '/qa',
    'qna_threads', new.id);
  return null;
end;
$$;

create trigger qna_threads_notify_question
  after insert on public.qna_threads
  for each row execute function public.notify_on_question();

create or replace function public.notify_on_answer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  if new.answer is not null and old.answer is null then
    select title into v_title from public.works where id = new.work_id;
    perform public.push_notification(
      new.asker_id, 'message',
      '質問に回答がありました',
      coalesce(v_title, '作品') || ' ／ ' || left(new.answer, 60),
      '/works/' || new.work_id::text || '/qa',
      'qna_threads', new.id);
  end if;
  return null;
end;
$$;

create trigger qna_threads_notify_answer
  after update of answer on public.qna_threads
  for each row execute function public.notify_on_answer();

-- -----------------------------------------------------------------------------
-- 4. レビュー通知の行き先（/creator/<id> → /creators/<id>）
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  select title into v_title from public.works where id = new.work_id;
  perform public.push_notification(
    new.creator_id, 'review',
    'レビューが届きました',
    coalesce(v_title, '作品') || ' に ★' || new.rating || ' のレビューが付きました',
    '/works/' || new.work_id::text || '/reviews',
    'reviews', new.id);
  return null;
end;
$$;

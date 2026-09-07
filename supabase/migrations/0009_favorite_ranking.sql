-- =============================================================================
-- 0009_favorite_ranking.sql
--
-- 「お気に入りが多い順」で並べ替えられるようにする。
--
-- work_favorites は (user_id, work_id) の複合主キーだけを持つ交差テーブルなので、
-- 並べ替えのたびに count(*) を取ると、一覧を開くたびに全件を数えることになる。
-- 一覧は最も頻繁に叩かれる画面なので、件数を works に持たせてトリガーで維持し、
-- インデックス1本で並べ替えられる形にする。
--
-- あわせて、お気に入り一覧の画面が必要とする情報
-- （値下げがあったか・在庫が戻ったか・まだ買えるか）をビューにまとめる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. いいね数を works に持たせる
-- -----------------------------------------------------------------------------
alter table public.works add column favorite_count integer not null default 0
  check (favorite_count >= 0);

comment on column public.works.favorite_count is
  'お気に入り数。work_favorites の増減にトリガーで追随する集計列。並べ替えの基準。';

-- 既存データから初期化
update public.works w
   set favorite_count = coalesce(f.n, 0)
  from (select work_id, count(*)::integer as n from public.work_favorites group by work_id) f
 where f.work_id = w.id;

create or replace function public.sync_work_favorite_count() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.works set favorite_count = favorite_count + 1 where id = new.work_id;
  elsif tg_op = 'DELETE' then
    -- 同時実行で負にならないよう greatest で止める
    update public.works
       set favorite_count = greatest(favorite_count - 1, 0)
     where id = old.work_id;
  end if;
  return null;
end;
$$;

create trigger work_favorites_sync_count
  after insert or delete on public.work_favorites
  for each row execute function public.sync_work_favorite_count();

-- 人気順の並べ替え用。同数のときは新しい作品を先に出すため created_at を第2キーに置く。
create index works_favorite_rank_idx
  on public.works (favorite_count desc, created_at desc)
  where status = 'published';

-- お気に入り一覧を「追加した順」で引くため
create index work_favorites_user_created_idx
  on public.work_favorites (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2. 値下げを検知できるようにする
--    画面の「値下げあり」チップと通知のために、最安値の履歴を持つ。
-- -----------------------------------------------------------------------------
alter table public.works add column min_price_jpy integer;
alter table public.works add column previous_min_price_jpy integer;
alter table public.works add column price_changed_at timestamptz;

comment on column public.works.min_price_jpy is
  '出品中バリアントの最安値。カードの「¥1,800〜」表示と価格帯の絞り込みに使う。';
comment on column public.works.previous_min_price_jpy is
  '直前の最安値。これより min_price_jpy が下がっていれば値下げとして扱う。';

-- バリアントの価格・公開状態が変わったら、作品側の最安値を取り直す
create or replace function public.sync_work_min_price() returns trigger
language plpgsql as $$
declare
  target uuid := coalesce(new.work_id, old.work_id);
  new_min integer;
  old_min integer;
begin
  select min(price_jpy) into new_min
    from public.work_variants
   where work_id = target and is_listed and price_jpy is not null;

  select min_price_jpy into old_min from public.works where id = target;

  if new_min is distinct from old_min then
    update public.works
       set previous_min_price_jpy = old_min,
           min_price_jpy = new_min,
           price_changed_at = now()
     where id = target;
  end if;
  return null;
end;
$$;

create trigger work_variants_sync_min_price
  after insert or update of price_jpy, is_listed or delete on public.work_variants
  for each row execute function public.sync_work_min_price();

-- -----------------------------------------------------------------------------
-- 3. 一覧・お気に入り画面が読むビュー
-- -----------------------------------------------------------------------------
create or replace view public.work_list_items as
select
  w.id,
  w.creator_id,
  p.display_name as creator_name,
  w.title,
  w.status,
  w.favorite_count,
  w.min_price_jpy,
  w.previous_min_price_jpy,
  w.price_changed_at,
  -- 値下げ中かどうか（7日以内に最安値が下がった）
  (w.previous_min_price_jpy is not null
   and w.min_price_jpy is not null
   and w.min_price_jpy < w.previous_min_price_jpy
   and w.price_changed_at > now() - interval '7 days') as is_price_dropped,
  -- 買える状態か（出品中のバリアントが1つでもあるか）
  exists (
    select 1 from public.work_variants v
     where v.work_id = w.id and v.is_listed and v.is_printable
  ) as is_available,
  exists (
    select 1 from public.work_variants v
     where v.work_id = w.id and v.is_listed and coalesce(v.stock, 0) > 0
  ) as has_stock,
  coalesce(r.review_count, 0) as review_count,
  r.avg_rating,
  w.created_at
from public.works w
join public.profiles p on p.id = w.creator_id
left join (
  select work_id, count(*)::integer as review_count, round(avg(rating)::numeric, 1) as avg_rating
    from public.reviews group by work_id
) r on r.work_id = w.id;

comment on view public.work_list_items is
  '作品一覧・検索結果・お気に入り一覧が共通で読むビュー。並べ替えのキー（favorite_count / min_price_jpy / avg_rating / created_at）をすべて持つ。';

-- お気に入り一覧。並べ替えは呼び出し側で order by を付ける。
--   人気順      : order by favorite_count desc, work_created_at desc
--   追加した順  : order by favorited_at desc
--   価格が安い順: order by min_price_jpy asc nulls last
create or replace view public.my_favorites as
select
  f.user_id,
  f.created_at as favorited_at,
  l.*,
  -- お気に入りに入れた時点より値下がりしているか
  (l.min_price_jpy is not null
   and l.previous_min_price_jpy is not null
   and l.min_price_jpy < l.previous_min_price_jpy
   and l.price_changed_at > f.created_at) as dropped_since_favorited
from public.work_favorites f
join public.work_list_items l on l.id = f.work_id;

comment on view public.my_favorites is
  'ログイン中のユーザーのお気に入り一覧。RLS が work_favorites 側で効くので、自分の行しか返らない。';

-- -----------------------------------------------------------------------------
-- 4. 人気順の取得関数（一覧・検索で使う）
-- -----------------------------------------------------------------------------
create or replace function public.popular_works(
  p_limit integer default 24,
  p_offset integer default 0,
  p_nui_size_cm numeric default null
) returns setof public.work_list_items
language sql stable as $$
  select l.*
    from public.work_list_items l
   where l.status = 'published'
     and l.is_available
     and (
       p_nui_size_cm is null
       or exists (
         select 1 from public.work_variants v
          where v.work_id = l.id and v.is_listed and v.nui_size_cm = p_nui_size_cm
       )
     )
   order by l.favorite_count desc, l.created_at desc
   limit p_limit offset p_offset;
$$;

comment on function public.popular_works(integer, integer, numeric) is
  '「お気に入りが多い順」の一覧。対応ぬいサイズでの絞り込みに対応する。';

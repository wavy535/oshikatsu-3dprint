-- ============================================================
-- 0016: コーデ投稿(いいね)の集計トリガー
-- DESIGN.md §4.4.4 準拠。coordinates.like_count は集計キャッシュ。
-- products.favorite_count(0003)と同じパターンでトリガー更新する。
-- ============================================================
create or replace function public.refresh_coordinate_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coordinate_id uuid;
begin
  v_coordinate_id := coalesce(new.coordinate_id, old.coordinate_id);
  update public.coordinates c set
    like_count = s.cnt
  from (
    select count(*) cnt from public.coordinate_likes where coordinate_id = v_coordinate_id
  ) s
  where c.id = v_coordinate_id;
  return null;
end;
$$;

create trigger coordinate_likes_refresh
  after insert or delete on public.coordinate_likes
  for each row execute function public.refresh_coordinate_like_count();

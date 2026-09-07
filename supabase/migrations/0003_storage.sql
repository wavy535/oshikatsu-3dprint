-- =============================================================================
-- Osinest Phase 1: Storage バケット
--   - work-stl        : 非公開。STLファイル本体（購入者本人・クリエイター・運営のみ取得可）
--   - work-images      : 公開。作品サムネイル／ギャラリー画像
--   - coordinate-images: 公開。推し空間コーディネート投稿写真
--   - avatars          : 公開。プロフィールアイコン
--   - review-photos     : 公開。レビュー添付写真
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('work-stl', 'work-stl', false),
  ('work-images', 'work-images', true),
  ('coordinate-images', 'coordinate-images', true),
  ('avatars', 'avatars', true),
  ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

-- work-stl: クリエイター本人は自分のファイルを読み書き可能。
-- パス規約: {creator_id}/{work_id}/{filename}.stl
create policy "creators manage own stl files"
  on storage.objects for all
  using (bucket_id = 'work-stl' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'work-stl' and (storage.foldername(name))[1] = auth.uid()::text);

-- 購入確定済みの注文明細に紐づくSTLは購入者も取得可能
create policy "buyers read purchased stl files"
  on storage.objects for select
  using (
    bucket_id = 'work-stl'
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.buyer_id = auth.uid()
        and o.status in ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed')
        and oi.stl_storage_path_snapshot = name
    )
  );

-- work-images / coordinate-images / avatars / review-photos: 公開読み取り、
-- 書き込みは本人フォルダのみ（パス規約: {user_id}/...）
create policy "public read work images"
  on storage.objects for select
  using (bucket_id = 'work-images');

create policy "creators write own work images"
  on storage.objects for insert
  with check (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "creators manage own work images"
  on storage.objects for update
  using (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "creators delete own work images"
  on storage.objects for delete
  using (bucket_id = 'work-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read coordinate images"
  on storage.objects for select
  using (bucket_id = 'coordinate-images');

create policy "users write own coordinate images"
  on storage.objects for insert
  with check (bucket_id = 'coordinate-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read review photos"
  on storage.objects for select
  using (bucket_id = 'review-photos');

create policy "buyers write own review photos"
  on storage.objects for insert
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

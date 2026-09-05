-- ============================================================
-- 0009: ストレージバケット & Storage RLS
-- DESIGN.md §5.1 / §8.4 準拠
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images',      'product-images',      true,   5242880,  array['image/jpeg','image/png','image/webp']),
  ('product-assets',      'product-assets',      false,  209715200,array['model/stl','application/sla','application/octet-stream','model/3mf']),
  ('user-content',        'user-content',        true,   5242880,  array['image/jpeg','image/png','image/webp']),
  ('message-attachments', 'message-attachments', false,  10485760, null)
on conflict (id) do nothing;

-- ──────────────────────────────────────────────
-- product-assets : STL の保護（★本設計の核心）
--   パス規約: {creator_id}/{product_id}/{uuid}.stl
-- ──────────────────────────────────────────────
create policy "product_assets_select_owner_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-assets'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "product_assets_insert_owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_approved_creator()
  and public.owns_product(((storage.foldername(name))[2])::uuid)
);

create policy "product_assets_update_owner"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-assets'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "product_assets_delete_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-assets'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);
-- ★ anon ロールにはいかなるポリシーも与えない = 未ログインは完全遮断
-- ★ 購入者向けポリシーは存在しない = 購入してもSTLは取得できない

-- ──────────────────────────────────────────────
-- product-images : 公開画像。書込は作品オーナーのみ
--   パス規約: {creator_id}/{product_id}/{uuid}.webp
-- ──────────────────────────────────────────────
create policy "product_images_public_read"
on storage.objects for select to public
using (bucket_id = 'product-images');

create policy "product_images_write_owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_approved_creator()
);

create policy "product_images_delete_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

-- ──────────────────────────────────────────────
-- user-content : 公開読み取り / 本人のみ書込
--   パス規約: {user_id}/{kind}/{uuid}.webp
-- ──────────────────────────────────────────────
create policy "user_content_public_read"
on storage.objects for select to public
using (bucket_id = 'user-content');

create policy "user_content_write_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-content'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "user_content_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-content'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- ──────────────────────────────────────────────
-- message-attachments : スレッド参加者のみ
--   パス規約: {thread_id}/{uuid}.{ext}
-- ──────────────────────────────────────────────
create policy "message_attachments_member_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and (public.is_admin()
       or public.is_thread_member(((storage.foldername(name))[1])::uuid))
);

create policy "message_attachments_member_write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and public.is_thread_member(((storage.foldername(name))[1])::uuid)
);

-- ============================================================
-- 0023: product_assets に UPDATE ポリシーを足す
--
-- 0008 では product_assets に select / insert / delete しかポリシーが無く、
-- クリエイター本人でも UPDATE が RLS に弾かれていた（エラーにならず 0 行更新）。
-- STEP2「印刷指示」はパーツ行の更新なので、これが無いと保存が黙って失敗する。
-- ============================================================

create policy assets_update_owner on public.product_assets
  for update using (public.owns_product(product_id))
       with check (public.owns_product(product_id));

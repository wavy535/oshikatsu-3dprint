-- ============================================================
-- 0008: RLS ポリシー（テーブル）
-- DESIGN.md §8.1〜§8.3 準拠
--
-- 原則: 全テーブルで enable row level security を実行する。
-- DESIGN.md が明示的に SQL を示していないテーブル（cart_items,
-- favorites, shipments, order_events, coordinate_images/likes,
-- review_images, asset_access_logs, payout_export_logs, stripe_events,
-- categories/tags/nui_sizes の書込側 等）についても、同章が定めた
-- 「同型ポリシーを適用」の指示と各テーブルのアクセスマトリクス
-- （誰が読み/誰が書けるか）に沿って一貫したポリシーを補って全テーブルを
-- 有効化する。
-- ============================================================

-- ══════════════════════════════════════════════
-- profiles
-- ══════════════════════════════════════════════
alter table public.profiles enable row level security;

create policy profiles_select_public on public.profiles
  for select using (deleted_at is null);

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ══════════════════════════════════════════════
-- user_nuis / shipping_addresses : 本人のみ（Admin も原則読まない）
-- ══════════════════════════════════════════════
alter table public.user_nuis enable row level security;
create policy user_nuis_own on public.user_nuis
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.shipping_addresses enable row level security;
create policy addresses_own on public.shipping_addresses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ══════════════════════════════════════════════
-- creator_profiles : 本人は自分の申請を閲覧・作成、承認/却下は Admin のみ
-- ══════════════════════════════════════════════
alter table public.creator_profiles enable row level security;
create policy creator_profiles_select_own on public.creator_profiles
  for select using (user_id = auth.uid());
create policy creator_profiles_insert_own on public.creator_profiles
  for insert with check (user_id = auth.uid());
create policy creator_profiles_admin_all on public.creator_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ══════════════════════════════════════════════
-- payout_accounts : 本人のみ。Admin にも SELECT を与えない
-- ══════════════════════════════════════════════
alter table public.payout_accounts enable row level security;
create policy payout_accounts_own on public.payout_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- payout_export_logs : Admin のみ閲覧。書込はサーバー(service_role)のみ
alter table public.payout_export_logs enable row level security;
create policy payout_export_logs_admin_select on public.payout_export_logs
  for select using (public.is_admin());

-- ══════════════════════════════════════════════
-- nui_sizes / categories / tags / filaments : 公開マスタ
-- SELECT は全員可、書込は admin のみ
-- ══════════════════════════════════════════════
alter table public.nui_sizes enable row level security;
create policy nui_sizes_select on public.nui_sizes for select using (true);
create policy nui_sizes_admin  on public.nui_sizes for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.categories enable row level security;
create policy categories_select on public.categories for select using (true);
create policy categories_admin  on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.tags enable row level security;
create policy tags_select on public.tags for select using (true);
create policy tags_admin  on public.tags for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.filaments enable row level security;
create policy filaments_select on public.filaments for select using (true);
create policy filaments_admin  on public.filaments for all
  using (public.is_admin()) with check (public.is_admin());

-- ══════════════════════════════════════════════
-- products
-- ══════════════════════════════════════════════
alter table public.products enable row level security;

create policy products_select_published on public.products
  for select using (status = 'published' and deleted_at is null);

create policy products_select_own on public.products
  for select using (creator_id = auth.uid());

create policy products_insert_own on public.products
  for insert with check (
    creator_id = auth.uid() and public.is_approved_creator()
  );
create policy products_update_own on public.products
  for update using (creator_id = auth.uid() and deleted_at is null)
       with check (creator_id = auth.uid());

create policy products_admin_all on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ══════════════════════════════════════════════
-- product_assets : ★STL。buyer には一切見せない
-- ══════════════════════════════════════════════
alter table public.product_assets enable row level security;

create policy assets_select_owner on public.product_assets
  for select using (public.owns_product(product_id));
create policy assets_insert_owner on public.product_assets
  for insert with check (public.owns_product(product_id));
create policy assets_delete_owner on public.product_assets
  for delete using (public.owns_product(product_id));

create policy assets_admin_all on public.product_assets
  for all using (public.is_admin()) with check (public.is_admin());
-- ※ buyer 向けポリシーは意図的に存在しない = 全拒否

-- asset_access_logs : 監査ログ。Admin のみ閲覧、書込はサーバーのみ
alter table public.asset_access_logs enable row level security;
create policy asset_access_logs_admin_select on public.asset_access_logs
  for select using (public.is_admin());

-- ══════════════════════════════════════════════
-- 公開子テーブル（画像・タグ・サイズ・フィラメント紐付け）
-- ══════════════════════════════════════════════
alter table public.product_images enable row level security;
create policy product_images_select on public.product_images
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id
              and (p.status = 'published' or p.creator_id = auth.uid() or public.is_admin()))
  );
create policy product_images_write_owner on public.product_images
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

alter table public.product_nui_sizes enable row level security;
create policy product_nui_sizes_select on public.product_nui_sizes
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id
              and (p.status = 'published' or p.creator_id = auth.uid() or public.is_admin()))
  );
create policy product_nui_sizes_write_owner on public.product_nui_sizes
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

alter table public.product_tags enable row level security;
create policy product_tags_select on public.product_tags
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id
              and (p.status = 'published' or p.creator_id = auth.uid() or public.is_admin()))
  );
create policy product_tags_write_owner on public.product_tags
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

alter table public.product_filaments enable row level security;
create policy product_filaments_select on public.product_filaments
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id
              and (p.status = 'published' or p.creator_id = auth.uid() or public.is_admin()))
  );
create policy product_filaments_write_owner on public.product_filaments
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

-- favorites : 本人のみ操作可能。誰が何をお気に入りしたかは公開しない
alter table public.favorites enable row level security;
create policy favorites_own on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ══════════════════════════════════════════════
-- cart_items : 本人のみ
-- ══════════════════════════════════════════════
alter table public.cart_items enable row level security;
create policy cart_items_own on public.cart_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ══════════════════════════════════════════════
-- orders / order_items
-- ══════════════════════════════════════════════
alter table public.orders enable row level security;

create policy orders_select_buyer on public.orders
  for select using (buyer_id = auth.uid());

create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

-- ★ orders への直接 INSERT/UPDATE はアプリから行わない。
--   Checkout / Webhook / Admin 操作はすべて SECURITY DEFINER 関数(service_role)を通す。
--   buyer による直接更新ポリシーは意図的に存在しない
--   （受取確認は guard_order_status トリガが is_admin() OR 本人チェックを行うため、
--    admin ポリシーの all 経由だけでは本人の受取確認ができない点に注意。
--    Server Action 側では admin client 経由で完了させる設計とする）

-- order_items
alter table public.order_items enable row level security;

create policy order_items_select_buyer on public.order_items
  for select using (public.owns_order(order_id));

create policy order_items_select_creator on public.order_items
  for select using (creator_id = auth.uid());

create policy order_items_admin_all on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- order_events : 監査ログ。閲覧のみ、書込はサーバー側 RPC(SECURITY DEFINER)経由
alter table public.order_events enable row level security;
create policy order_events_select_buyer on public.order_events
  for select using (public.owns_order(order_id));
create policy order_events_select_creator on public.order_events
  for select using (
    exists (select 1 from public.order_items oi
            where oi.order_id = order_events.order_id and oi.creator_id = auth.uid())
  );
create policy order_events_admin_all on public.order_events
  for all using (public.is_admin()) with check (public.is_admin());

-- shipments : 購入者は閲覧のみ、登録・変更は Admin のみ
alter table public.shipments enable row level security;
create policy shipments_select_buyer on public.shipments
  for select using (public.owns_order(order_id));
create policy shipments_admin_all on public.shipments
  for all using (public.is_admin()) with check (public.is_admin());

-- stripe_events : クライアントからのアクセスは一切不要（service_role のみ）
alter table public.stripe_events enable row level security;

-- ══════════════════════════════════════════════
-- reviews
-- ══════════════════════════════════════════════
alter table public.reviews enable row level security;

create policy reviews_select_public on public.reviews
  for select using (is_public and deleted_at is null);
create policy reviews_select_own on public.reviews
  for select using (user_id = auth.uid());

create policy reviews_insert_purchased on public.reviews
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = reviews.order_item_id
        and o.buyer_id = auth.uid()
        and o.status = 'completed'
        and oi.product_id = reviews.product_id
    )
  );

create policy reviews_update_own on public.reviews
  for update using (user_id = auth.uid() and created_at > now() - interval '14 days')
       with check (user_id = auth.uid());

create policy reviews_update_creator_reply on public.reviews
  for update using (public.owns_product(product_id));

create policy reviews_admin_all on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- review_images : レビューの公開状態に追従。書込は投稿者本人のみ
alter table public.review_images enable row level security;
create policy review_images_select on public.review_images
  for select using (
    exists (select 1 from public.reviews r
            where r.id = review_id
              and ((r.is_public and r.deleted_at is null) or r.user_id = auth.uid() or public.is_admin()))
  );
create policy review_images_write_owner on public.review_images
  for all using (
    exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid())
  );

-- ══════════════════════════════════════════════
-- coordinates / coordinate_items / coordinate_images / coordinate_likes
-- ══════════════════════════════════════════════
alter table public.coordinates enable row level security;
create policy coordinates_select_public on public.coordinates
  for select using ((is_public and deleted_at is null) or user_id = auth.uid() or public.is_admin());
create policy coordinates_write_own on public.coordinates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy coordinates_admin on public.coordinates
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.coordinate_items enable row level security;
create policy coordinate_items_select on public.coordinate_items
  for select using (
    exists (select 1 from public.coordinates c
            where c.id = coordinate_id
              and ((c.is_public and c.deleted_at is null) or c.user_id = auth.uid()))
  );
create policy coordinate_items_write_own on public.coordinate_items
  for all using (
    exists (select 1 from public.coordinates c where c.id = coordinate_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.coordinates c where c.id = coordinate_id and c.user_id = auth.uid())
  );

alter table public.coordinate_images enable row level security;
create policy coordinate_images_select on public.coordinate_images
  for select using (
    exists (select 1 from public.coordinates c
            where c.id = coordinate_id
              and ((c.is_public and c.deleted_at is null) or c.user_id = auth.uid()))
  );
create policy coordinate_images_write_own on public.coordinate_images
  for all using (
    exists (select 1 from public.coordinates c where c.id = coordinate_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.coordinates c where c.id = coordinate_id and c.user_id = auth.uid())
  );

alter table public.coordinate_likes enable row level security;
create policy coordinate_likes_select on public.coordinate_likes
  for select using (
    exists (select 1 from public.coordinates c
            where c.id = coordinate_id and c.is_public and c.deleted_at is null)
  );
create policy coordinate_likes_own on public.coordinate_likes
  for insert with check (user_id = auth.uid());
create policy coordinate_likes_delete_own on public.coordinate_likes
  for delete using (user_id = auth.uid());

-- ══════════════════════════════════════════════
-- message_threads / messages
-- ══════════════════════════════════════════════
alter table public.message_threads enable row level security;
create policy threads_select_member on public.message_threads
  for select using (buyer_id = auth.uid() or creator_id = auth.uid() or public.is_admin());
create policy threads_insert_buyer on public.message_threads
  for insert with check (buyer_id = auth.uid());
create policy threads_update_member on public.message_threads
  for update using (public.is_thread_member(id) or public.is_admin());

alter table public.messages enable row level security;
create policy messages_select_member on public.messages
  for select using (public.is_thread_member(thread_id) or public.is_admin());
create policy messages_insert_member on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_thread_member(thread_id)
  );
create policy messages_soft_delete_own on public.messages
  for update using (sender_id = auth.uid());

-- ══════════════════════════════════════════════
-- payouts / payout_items
-- ══════════════════════════════════════════════
alter table public.payouts enable row level security;
create policy payouts_select_own on public.payouts
  for select using (creator_id = auth.uid());
create policy payouts_admin_all on public.payouts
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.payout_items enable row level security;
create policy payout_items_select_own on public.payout_items
  for select using (
    exists (select 1 from public.payouts p
            where p.id = payout_id and p.creator_id = auth.uid())
  );
create policy payout_items_admin on public.payout_items
  for all using (public.is_admin()) with check (public.is_admin());

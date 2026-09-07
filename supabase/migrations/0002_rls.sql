-- =============================================================================
-- Osinest Phase 1: Row Level Security ポリシー
-- 方針:
--   - 一般ユーザーは Supabase Auth のセッション（anon/authenticated ロール）でアクセス
--   - 運営管理画面（Admin Dashboard）はサーバー専用の Service Role Key を使用し、
--     RLSをバイパスして全操作を行う（createServiceRoleClient を参照）
--   - STLファイルは非公開ストレージバケットに保存し、購入確定後のみ運営がアクセス
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.tags enable row level security;
alter table public.user_nui_sizes enable row level security;
alter table public.works enable row level security;
alter table public.work_images enable row level security;
alter table public.work_tags enable row level security;
alter table public.work_favorites enable row level security;
alter table public.creator_follows enable row level security;
alter table public.coordinate_posts enable row level security;
alter table public.coordinate_post_pins enable row level security;
alter table public.custom_order_requests enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payout_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.qna_threads enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles are publicly viewable"
  on public.profiles for select
  using (true);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- addresses（本人のみ）
-- -----------------------------------------------------------------------------
create policy "users manage own addresses"
  on public.addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- payout_accounts（クリエイター本人のみ）
-- -----------------------------------------------------------------------------
create policy "creators manage own payout account"
  on public.payout_accounts for all
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- -----------------------------------------------------------------------------
-- tags（マスタは全員閲覧可、書き込みは管理者のみ）
-- -----------------------------------------------------------------------------
create policy "tags are publicly viewable"
  on public.tags for select
  using (true);

create policy "only admin manages tags"
  on public.tags for all
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- user_nui_sizes（本人のみ）
-- -----------------------------------------------------------------------------
create policy "users manage own nui sizes"
  on public.user_nui_sizes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- works: 公開作品は誰でも閲覧、非公開はクリエイター本人のみ
-- -----------------------------------------------------------------------------
create policy "published works are publicly viewable"
  on public.works for select
  using (status = 'published' or creator_id = auth.uid() or public.is_admin());

create policy "creators insert own works"
  on public.works for insert
  with check (creator_id = auth.uid());

create policy "creators update own works"
  on public.works for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy "creators delete own works"
  on public.works for delete
  using (creator_id = auth.uid());

-- -----------------------------------------------------------------------------
-- work_images / work_tags（作品の可視性に追従）
-- -----------------------------------------------------------------------------
create policy "work images follow work visibility"
  on public.work_images for select
  using (
    exists (
      select 1 from public.works w
      where w.id = work_id
        and (w.status = 'published' or w.creator_id = auth.uid() or public.is_admin())
    )
  );

create policy "creators manage own work images"
  on public.work_images for all
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));

create policy "work tags follow work visibility"
  on public.work_tags for select
  using (
    exists (
      select 1 from public.works w
      where w.id = work_id
        and (w.status = 'published' or w.creator_id = auth.uid() or public.is_admin())
    )
  );

create policy "creators manage own work tags"
  on public.work_tags for all
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- favorites / follows（本人のみ操作、閲覧は本人のみ）
-- -----------------------------------------------------------------------------
create policy "users manage own favorites"
  on public.work_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own follows"
  on public.creator_follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- -----------------------------------------------------------------------------
-- coordinate_posts / pins（投稿は公開、書き込みは本人のみ）
-- -----------------------------------------------------------------------------
create policy "coordinate posts are publicly viewable"
  on public.coordinate_posts for select
  using (true);

create policy "users manage own coordinate posts"
  on public.coordinate_posts for insert
  with check (auth.uid() = user_id);

create policy "users update own coordinate posts"
  on public.coordinate_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own coordinate posts"
  on public.coordinate_posts for delete
  using (auth.uid() = user_id);

create policy "coordinate pins are publicly viewable"
  on public.coordinate_post_pins for select
  using (true);

create policy "users manage pins on own posts"
  on public.coordinate_post_pins for all
  using (exists (select 1 from public.coordinate_posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.coordinate_posts p where p.id = post_id and p.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- custom_order_requests（依頼者・クリエイター双方のみ閲覧可）
-- -----------------------------------------------------------------------------
create policy "participants view custom requests"
  on public.custom_order_requests for select
  using (auth.uid() = requester_id or auth.uid() = creator_id);

create policy "requesters create custom requests"
  on public.custom_order_requests for insert
  with check (auth.uid() = requester_id);

create policy "creators respond to custom requests"
  on public.custom_order_requests for update
  using (auth.uid() = creator_id or auth.uid() = requester_id)
  with check (auth.uid() = creator_id or auth.uid() = requester_id);

-- -----------------------------------------------------------------------------
-- carts / cart_items（本人のみ）
-- -----------------------------------------------------------------------------
create policy "users manage own cart"
  on public.carts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own cart items"
  on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- orders / order_items: 購入者本人、または当該作品のクリエイターのみ閲覧可
--   （印刷・発送業務は運営が Service Role で行うため一般ユーザーへの更新権限は最小限）
-- -----------------------------------------------------------------------------
create policy "buyers view own orders"
  on public.orders for select
  using (auth.uid() = buyer_id or public.is_admin());

create policy "buyers create own orders"
  on public.orders for insert
  with check (auth.uid() = buyer_id);

create policy "buyers view own order items"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
    or creator_id = auth.uid()
    or public.is_admin()
  );

create policy "order status history visible to participants"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.buyer_id = auth.uid() or public.is_admin())
    )
  );

-- -----------------------------------------------------------------------------
-- payout_requests（クリエイター本人のみ）
-- -----------------------------------------------------------------------------
create policy "creators manage own payout requests"
  on public.payout_requests for all
  using (auth.uid() = creator_id or public.is_admin())
  with check (auth.uid() = creator_id);

-- -----------------------------------------------------------------------------
-- reviews（公開閲覧、投稿は購入者本人のみ）
-- -----------------------------------------------------------------------------
create policy "reviews are publicly viewable"
  on public.reviews for select
  using (true);

create policy "buyers create reviews for own purchases"
  on public.reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.buyer_id = auth.uid() and o.status = 'completed'
    )
  );

-- -----------------------------------------------------------------------------
-- qna_threads（作品の可視性に追従、質問は誰でも投稿可、回答はクリエイターのみ）
-- -----------------------------------------------------------------------------
create policy "qna is publicly viewable"
  on public.qna_threads for select
  using (true);

create policy "users ask questions"
  on public.qna_threads for insert
  with check (auth.uid() = asker_id);

create policy "creators answer own work questions"
  on public.qna_threads for update
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- messages（送信者・受信者のみ）
-- -----------------------------------------------------------------------------
create policy "participants view own messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "users send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "recipients mark messages read"
  on public.messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- -----------------------------------------------------------------------------
-- notifications（本人のみ）
-- -----------------------------------------------------------------------------
create policy "users view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "users update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

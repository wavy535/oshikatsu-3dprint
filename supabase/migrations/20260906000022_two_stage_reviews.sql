-- ============================================================
-- 0022: 受け取り評価の 2 段構成
--
-- Figma ①購入フロー「受け取り評価・レビュー投稿 61:153」:
--   ① クリエイターへの総合評価（デザイン・完成度／説明との一致／サイズ感）
--   ② 印刷・梱包・配送（運営あて・任意）
-- ② は「クリエイターの評価に反映されない」ことが要件なので、
-- products.review_avg を集計する reviews とは別テーブルに分ける。
-- 同じテーブルに列で足すと、集計トリガーの改修ミスひとつで
-- 運営の印刷品質がクリエイターの星に混ざる事故が起きるため。
-- ============================================================

-- ① クリエイターあて: 3 軸を足す。rating（総合）は従来どおり必須で、
--    products.review_avg もこれまでどおり rating だけを見る。
alter table public.reviews
  add column rating_design   smallint check (rating_design between 1 and 5),
  add column rating_accuracy smallint check (rating_accuracy between 1 and 5),
  add column rating_size     smallint check (rating_size between 1 and 5);

comment on column public.reviews.rating_design is
  'デザイン・完成度。products.review_avg には影響しない内訳';
comment on column public.reviews.rating_accuracy is '説明との一致';
comment on column public.reviews.rating_size is 'サイズ感';

-- ② 運営あて: 印刷・梱包・配送。注文単位で 1 件。
create table public.service_reviews (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  rating_print    smallint not null check (rating_print between 1 and 5),
  rating_packing  smallint not null check (rating_packing between 1 and 5),
  rating_delivery smallint not null check (rating_delivery between 1 and 5),
  comment        text check (char_length(comment) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.service_reviews (created_at desc);
create trigger service_reviews_set_updated_at
  before update on public.service_reviews
  for each row execute function public.set_updated_at();

comment on table public.service_reviews is
  '運営あての評価（印刷・梱包・配送）。クリエイターの星には一切反映しない';

alter table public.service_reviews enable row level security;

-- 書けるのはその注文の購入者だけ。読めるのは本人と admin
create policy service_reviews_select_own on public.service_reviews
  for select using (user_id = auth.uid() or public.is_admin());
create policy service_reviews_insert_own on public.service_reviews
  for insert with check (user_id = auth.uid() and public.owns_order(order_id));
create policy service_reviews_update_own on public.service_reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy service_reviews_admin_all on public.service_reviews
  for all using (public.is_admin()) with check (public.is_admin());

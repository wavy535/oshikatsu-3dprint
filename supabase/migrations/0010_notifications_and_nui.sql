-- =============================================================================
-- 0010_notifications_and_nui.sql
--
-- 3つのことをまとめて入れる。どれも「画面はあるのに置き場所がない」状態だったもの。
--
--  1. 通知     … 通知一覧・通知設定の裏側。既存のトリガー（発送・値下げ・修正依頼など）
--                 から自動で行が生まれるようにする。
--  2. マイぬい … ぬいの採寸値とアストラのスキャン結果。
--  3. 内寸     … 「うちの子で見る」のサイズ相性判定に必要な、作品側の内寸。
--
-- 通知を独立した機能として作らないのがこのファイルの方針。
-- 通知は「すでにある状態遷移の副産物」なので、アプリ側で notify() を呼ぶのではなく
-- 状態を持つテーブルのトリガーから発火させる。呼び忘れで通知が届かない事故を防ぐ。
-- =============================================================================

-- =============================================================================
-- 1. 通知
-- =============================================================================

create type public.notification_kind as enum (
  'order_shipping',   -- 注文・配送の進捗（印刷開始・発送・お届け）
  'favorite_price',   -- お気に入りの値下げ・再入荷
  'message',          -- メッセージの受信
  'review',           -- レビュー・評価
  'creator',          -- クリエイター向け（販売・修正依頼・入金）
  'announcement'      -- OshiNest からのお知らせ
);

comment on type public.notification_kind is
  '通知の種類。通知設定のマトリクスの行と1対1で対応する。';

create type public.notification_digest as enum ('instant', 'daily');

-- -----------------------------------------------------------------------------
-- 1-1. 通知本体
--
-- 0001 に `notifications(type text, payload jsonb)` という置き場所だけの定義がある。
-- payload に何を入れるかが決まっていないと画面が作れないので、
-- 型のある列に作り替える。まだ使っていないテーブルなので、その場で移行する。
-- -----------------------------------------------------------------------------
alter table public.notifications add column kind public.notification_kind;
alter table public.notifications add column title text;
alter table public.notifications add column body text;

-- 遷移先。通知一覧の各行は必ず1つ行き先を持つ、という設計上の約束を
-- NOT NULL で担保する。「◯◯しました」で終わる通知を作れないようにする。
alter table public.notifications add column link_path text;

-- 由来（重複生成の抑止と、あとから追跡するため）
alter table public.notifications add column source_table text;
alter table public.notifications add column source_id uuid;

alter table public.notifications add column emailed_at timestamptz;
alter table public.notifications add column pushed_at timestamptz;

-- 既存行があれば payload から拾えるだけ拾って移す
update public.notifications
   set kind      = coalesce(
         case when type = any (enum_range(null::public.notification_kind)::text[])
              then type::public.notification_kind end,
         'announcement'),
       title     = coalesce(payload ->> 'title', 'お知らせ'),
       body      = payload ->> 'body',
       link_path = coalesce(payload ->> 'link_path', '/notifications')
 where kind is null;

alter table public.notifications alter column kind set not null;
alter table public.notifications alter column title set not null;
alter table public.notifications alter column link_path set not null;

alter table public.notifications drop column type;
alter table public.notifications drop column payload;

comment on table public.notifications is
  'アプリ内通知。行き先(link_path)が必須。作成はトリガー経由で、アプリからは既読更新だけを行う。';
comment on column public.notifications.link_path is
  '通知を押したときの遷移先。行き先のない通知は作らない（サポート問い合わせになるため）。';

-- 一覧は「自分の新しい順」でしか引かない
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- 未読バッジ用。未読だけを見るので部分インデックスにする
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- 種類でのフィルタ（通知一覧のチップ）
create index notifications_user_kind_idx
  on public.notifications (user_id, kind, created_at desc);

-- 同じ出来事で二重に通知しない
create unique index notifications_source_uniq
  on public.notifications (user_id, source_table, source_id, kind)
  where source_id is not null;

-- -----------------------------------------------------------------------------
-- 1-2. 受け取り方の設定
-- -----------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  in_app boolean not null default true,
  email boolean not null default true,
  push boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),

  -- 取引に関わる通知はアプリ内でオフにできない。
  -- 届かなかったこと自体がトラブルになるため、UIだけでなくDBでも止める。
  constraint mandatory_kinds_stay_in_app
    check (kind not in ('order_shipping', 'creator') or in_app)
);

comment on table public.notification_preferences is
  '通知の種類ごとの受け取り方。行がない種類は「アプリ内・メールON／プッシュOFF」を既定とする。';
comment on constraint mandatory_kinds_stay_in_app on public.notification_preferences is
  '発送・修正依頼・入金はアプリ内通知を必須にする（通知設定画面の「常時オン」に対応）。';

create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_to text,                                     -- NULL なら auth.users のメールを使う
  digest public.notification_digest not null default 'instant',
  digest_hour smallint not null default 20 check (digest_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is
  'メールの宛先とまとめ受信。値下げのような急がない通知が発送通知と同じ頻度で届くと読まれなくなるため。';

-- -----------------------------------------------------------------------------
-- 1-3. 発火の共通関数
-- -----------------------------------------------------------------------------
-- 設定を見て、アプリ内がONのときだけ行を作る。
-- 必須種別（order_shipping / creator）は設定に関わらず必ず作る。
create or replace function public.push_notification(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text,
  p_link_path text,
  p_source_table text default null,
  p_source_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_in_app boolean;
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  select in_app into v_in_app
    from public.notification_preferences
   where user_id = p_user_id and kind = p_kind;

  -- 行がなければ既定ON。必須種別は設定を無視して通す。
  if p_kind in ('order_shipping', 'creator') then
    v_in_app := true;
  end if;
  v_in_app := coalesce(v_in_app, true);

  if not v_in_app then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, link_path, source_table, source_id)
  values (p_user_id, p_kind, p_title, p_body, p_link_path, p_source_table, p_source_id)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.push_notification is
  '通知を1件作る。設定でアプリ内がOFFなら作らない。必須種別は設定を無視する。';

-- -----------------------------------------------------------------------------
-- 1-4. 既存の状態遷移から通知を出す
-- -----------------------------------------------------------------------------

-- (a) 発送登録 → 購入者へ
create or replace function public.notify_on_shipment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.orders where id = new.order_id;
  perform public.push_notification(
    v_buyer, 'order_shipping',
    'ご注文の商品を発送しました',
    coalesce(new.service_name, '宅配便')
      || case when new.tracking_number is not null
              then ' ／ 追跡番号 ' || new.tracking_number else '' end,
    '/orders/' || new.order_id::text,
    'shipments', new.id);
  return null;
end;
$$;

create trigger shipments_notify
  after insert on public.shipments
  for each row execute function public.notify_on_shipment();

-- (b) 印刷開始 → 購入者へ
create or replace function public.notify_on_print_start() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid;
begin
  if new.status = 'printing' and (old.status is distinct from 'printing') then
    select o.buyer_id into v_buyer
      from public.orders o where o.id = new.order_id;
    perform public.push_notification(
      v_buyer, 'order_shipping',
      '印刷を開始しました',
      'ジョブ ' || coalesce(new.job_no, new.id::text),
      '/orders/' || new.order_id::text,
      'print_jobs', new.id);
  end if;
  return null;
end;
$$;

create trigger print_jobs_notify_start
  after update of status on public.print_jobs
  for each row execute function public.notify_on_print_start();

-- (c) 最安値の下落 → その作品をお気に入りに入れている人へ
--     0009 の sync_work_min_price() が works を更新するので、works 側で拾う。
create or replace function public.notify_on_price_drop() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.min_price_jpy is null
     or new.previous_min_price_jpy is null
     or new.min_price_jpy >= new.previous_min_price_jpy then
    return null;
  end if;

  for r in
    select f.user_id from public.work_favorites f where f.work_id = new.id
  loop
    perform public.push_notification(
      r.user_id, 'favorite_price',
      'お気に入りの作品が値下げされました',
      new.title || '　¥' || to_char(new.previous_min_price_jpy, 'FM999,999')
                 || ' → ¥' || to_char(new.min_price_jpy, 'FM999,999'),
      '/works/' || new.id::text,
      'works_price', gen_random_uuid());   -- 値下げのたびに別通知にする
  end loop;
  return null;
end;
$$;

create trigger works_notify_price_drop
  after update of min_price_jpy on public.works
  for each row execute function public.notify_on_price_drop();

-- (d) メッセージ受信 → 宛先へ
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.sender_id;
  perform public.push_notification(
    new.recipient_id, 'message',
    coalesce(v_name, 'ユーザー') || ' さんからメッセージが届きました',
    left(new.body, 60),
    '/messages/' || new.sender_id::text,
    'messages', new.id);
  return null;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

-- (e) 売れた → クリエイターへ
create or replace function public.notify_on_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  select title into v_title from public.works where id = new.work_id;
  perform public.push_notification(
    new.creator_id, 'creator',
    '作品が売れました',
    coalesce(v_title, '作品') || ' ×' || new.quantity
      || ' ／ 売上 ¥' || to_char(new.creator_payout_amount, 'FM999,999'),
    '/creator/sales',
    'order_items', new.id);
  return null;
end;
$$;

create trigger order_items_notify_sale
  after insert on public.order_items
  for each row execute function public.notify_on_sale();

-- (f) 修正依頼 → クリエイターへ
create or replace function public.notify_on_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notification(
    new.creator_id, 'creator',
    '検品で修正依頼が発生しました',
    coalesce(new.revision_no, '修正依頼') || ' ／ 原因: ' || new.cause::text
      || ' ／ 期限 ' || to_char(new.due_at, 'MM月DD日'),
    '/creator/revisions/' || new.id::text,
    'revision_requests', new.id);
  return null;
end;
$$;

create trigger revision_requests_notify
  after insert on public.revision_requests
  for each row execute function public.notify_on_revision();

-- (g) レビュー投稿 → クリエイターへ
create or replace function public.notify_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  select title into v_title from public.works where id = new.work_id;
  perform public.push_notification(
    new.creator_id, 'review',
    'レビューが投稿されました',
    coalesce(v_title, '作品') || ' に ★' || new.rating || ' のレビューが付きました',
    '/creator/' || new.creator_id::text,
    'reviews', new.id);
  return null;
end;
$$;

create trigger reviews_notify
  after insert on public.reviews
  for each row execute function public.notify_on_review();

-- (h) 見積りの提示 → 相談した人へ
create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    perform public.push_notification(
      new.buyer_id, 'message',
      'オーダーメイドの見積りが届きました',
      coalesce(new.quote_no, '見積り')
        || ' ／ 合計 ¥'
        || to_char(new.price_jpy + new.print_fee_jpy + new.shipping_fee_jpy, 'FM999,999')
        || ' ／ 有効期限 ' || to_char(new.expires_at, 'MM月DD日'),
      '/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  end if;
  return null;
end;
$$;

create trigger custom_order_quotes_notify
  after insert or update of status on public.custom_order_quotes
  for each row execute function public.notify_on_quote_sent();

-- -----------------------------------------------------------------------------
-- 1-5. 読み取り・既読
-- -----------------------------------------------------------------------------
create or replace function public.unread_notification_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_all_notifications_read() returns integer
language sql security definer set search_path = public as $$
  with upd as (
    update public.notifications set read_at = now()
     where user_id = auth.uid() and read_at is null
     returning 1
  ) select count(*)::integer from upd;
$$;

comment on function public.mark_all_notifications_read is
  '通知一覧の「すべて既読にする」。';

-- 30日より古い既読通知は貯めない（画面のフッターにも同じことを書いてある）
create or replace function public.purge_old_notifications() returns integer
language sql security definer set search_path = public as $$
  with del as (
    delete from public.notifications
     where created_at < now() - interval '30 days'
     returning 1
  ) select count(*)::integer from del;
$$;

alter table public.notification_preferences enable row level security;
alter table public.notification_settings enable row level security;

-- notifications の select / update ポリシーは 0002 で本人限定にしてある。
-- 作成はトリガー（security definer）だけなので insert ポリシーは足さない。
-- 通知を消せるのは本人だけ。
create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_settings_own on public.notification_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- 2. マイぬい（アストラのスキャン結果を含む）
-- =============================================================================

create type public.nui_kind as enum ('plush', 'acrylic_stand', 'figure', 'other');

create type public.scan_status as enum (
  'capturing',   -- 撮影中
  'generating',  -- 生成中
  'ready',       -- 生成完了
  'failed'
);

create table public.nui_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind public.nui_kind not null default 'plush',

  -- 採寸値。作品との相性判定はすべてこの3つで行う。
  sit_height_mm numeric(7,1) not null check (sit_height_mm > 0),   -- 座高
  shoulder_width_mm numeric(7,1) check (shoulder_width_mm > 0),    -- 肩幅
  hug_width_mm numeric(7,1) check (hug_width_mm > 0),              -- 抱き幅

  -- 一覧の絞り込み用に、座高から 10 / 15 / 20cm に丸めた値をトリガーで入れる
  nui_size_cm numeric(4,1),

  is_main boolean not null default false,
  has_scan boolean not null default false,     -- スキャン完了で true。うちの子で見るの可否
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nui_profiles is
  'ユーザーが登録したぬい。採寸値が作品との相性判定とサイズ絞り込みの基準になる。';
comment on column public.nui_profiles.has_scan is
  'アストラのスキャンが完了しているか。false の間は「うちの子で見る」が使えない。';

-- メインのぬいは1人1体
create unique index nui_profiles_one_main_idx
  on public.nui_profiles (user_id) where is_main;

create index nui_profiles_user_idx on public.nui_profiles (user_id, created_at desc);

-- 座高からサイズ区分を決める。対応サイズは 10 / 15 / 20cm。
create or replace function public.sync_nui_size() returns trigger
language plpgsql as $$
begin
  new.nui_size_cm := case
    when new.sit_height_mm < 125 then 10.0
    when new.sit_height_mm < 175 then 15.0
    else 20.0
  end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger nui_profiles_sync_size
  before insert or update of sit_height_mm on public.nui_profiles
  for each row execute function public.sync_nui_size();

-- 1体目は自動でメインにする（絞り込みの既定値が空だと一覧が変わらず、機能に気づかれない）
create or replace function public.set_first_nui_as_main() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.nui_profiles where user_id = new.user_id and id <> new.id) then
    update public.nui_profiles set is_main = true where id = new.id;
  end if;
  return null;
end;
$$;

create trigger nui_profiles_first_is_main
  after insert on public.nui_profiles
  for each row execute function public.set_first_nui_as_main();

-- -----------------------------------------------------------------------------
-- 2-2. スキャン
-- -----------------------------------------------------------------------------
create table public.nui_scans (
  id uuid primary key default gen_random_uuid(),
  nui_id uuid references public.nui_profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  provider text not null default 'astra',
  external_session_id text,                -- アストラ側のセッション
  shot_count integer not null default 0 check (shot_count >= 0),
  status public.scan_status not null default 'capturing',
  duration_ms integer check (duration_ms >= 0),
  error_message text,

  -- 自動で読み取った採寸値。確認画面で人が直せるので、profiles 側とは別に残す。
  measured_sit_height_mm numeric(7,1),
  measured_shoulder_width_mm numeric(7,1),
  measured_hug_width_mm numeric(7,1),
  measure_confidence numeric(4,3) check (measure_confidence between 0 and 1),

  -- 撮影した写真は生成後30日で消す（画面にも明記している）
  photos_expire_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.nui_scans is
  'アストラでの1回のスキャン。撮影枚数・生成状態・自動採寸値を持つ。写真は photos_expire_at で失効。';
comment on column public.nui_scans.measure_confidence is
  '自動採寸の確からしさ。低いときに確認画面で「要確認」を出す。';

create index nui_scans_user_idx on public.nui_scans (user_id, created_at desc);
create index nui_scans_nui_idx on public.nui_scans (nui_id, created_at desc);

create table public.nui_assets (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.nui_scans (id) on delete cascade,
  nui_id uuid not null references public.nui_profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'model_glb', 'cutout_png', 'thumbnail')),
  storage_path text not null,
  bytes bigint check (bytes >= 0),
  created_at timestamptz not null default now()
);

comment on table public.nui_assets is
  '撮影写真と生成物。非公開バケット nui-scans に置く。公開プロフィールや作品ページには出さない。';

create index nui_assets_nui_idx on public.nui_assets (nui_id, kind);

-- 生成完了でプロフィール側にフラグを立て、本人に通知する
create or replace function public.apply_scan_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') then
    if new.nui_id is not null then
      update public.nui_profiles set has_scan = true, updated_at = now() where id = new.nui_id;
      select name into v_name from public.nui_profiles where id = new.nui_id;
    end if;
    update public.nui_scans set completed_at = coalesce(completed_at, now()) where id = new.id;

    perform public.push_notification(
      new.user_id, 'announcement',
      coalesce(v_name, 'ぬい') || ' の3Dモデルができました',
      '作品ページで「うちの子で見る」が使えるようになりました',
      '/my-nui/' || coalesce(new.nui_id::text, ''),
      'nui_scans', new.id);
  end if;
  return null;
end;
$$;

create trigger nui_scans_apply_ready
  after update of status on public.nui_scans
  for each row execute function public.apply_scan_ready();

-- -----------------------------------------------------------------------------
-- 2-3. 合成イメージのキャッシュ
-- -----------------------------------------------------------------------------
create table public.tryon_renders (
  id uuid primary key default gen_random_uuid(),
  nui_id uuid not null references public.nui_profiles (id) on delete cascade,
  variant_id uuid not null references public.work_variants (id) on delete cascade,
  view text not null check (view in ('front', 'angle', 'side', 'scale')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

comment on table public.tryon_renders is
  '（ぬい × バリアント × 視点）の合成結果。同じ組み合わせを毎回生成しないためのキャッシュ。';

create unique index tryon_renders_uniq
  on public.tryon_renders (nui_id, variant_id, view);

-- 作品データが差し替わったら、その作品の合成イメージは作り直す
create or replace function public.invalidate_tryon_renders() returns trigger
language plpgsql as $$
begin
  if new.asset_id is distinct from old.asset_id
     or new.scale_ratio is distinct from old.scale_ratio then
    delete from public.tryon_renders where variant_id = new.id;
  end if;
  return null;
end;
$$;

create trigger work_variants_invalidate_tryon
  after update on public.work_variants
  for each row execute function public.invalidate_tryon_renders();

alter table public.nui_profiles enable row level security;
alter table public.nui_scans enable row level security;
alter table public.nui_assets enable row level security;
alter table public.tryon_renders enable row level security;

create policy nui_profiles_own on public.nui_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nui_scans_own on public.nui_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nui_assets_own on public.nui_assets
  for all using (
    exists (select 1 from public.nui_profiles p where p.id = nui_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.nui_profiles p where p.id = nui_id and p.user_id = auth.uid())
  );
create policy tryon_renders_own on public.tryon_renders
  for all using (
    exists (select 1 from public.nui_profiles p where p.id = nui_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.nui_profiles p where p.id = nui_id and p.user_id = auth.uid())
  );

-- 非公開バケット。クリエイターにも運営の一般オペレーターにも見せない。
insert into storage.buckets (id, name, public)
values ('nui-scans', 'nui-scans', false)
on conflict (id) do nothing;

create policy "nui scans are private to the owner"
  on storage.objects for all to authenticated
  using (bucket_id = 'nui-scans' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nui-scans' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- 3. 作品側の内寸と、相性判定
-- =============================================================================

-- work_variants は外形（bbox）しか持っていない。外形では「ぬいが収まるか」は分からない。
-- 座面の幅・背もたれの高さ・座面の奥行のような “ぬいが入る側” の寸法を別に持つ。
alter table public.work_variants add column fit_width_mm numeric(8,2)
  check (fit_width_mm is null or fit_width_mm > 0);
alter table public.work_variants add column fit_height_mm numeric(8,2)
  check (fit_height_mm is null or fit_height_mm > 0);
alter table public.work_variants add column fit_depth_mm numeric(8,2)
  check (fit_depth_mm is null or fit_depth_mm > 0);
alter table public.work_variants add column fit_source text not null default 'creator'
  check (fit_source in ('creator', 'auto'));
alter table public.work_variants add column fit_note text;

comment on column public.work_variants.fit_width_mm is
  'ぬいが収まる幅（座面の幅など）。外形bboxとは別物で、相性判定はこちらを使う。';
comment on column public.work_variants.fit_height_mm is
  'ぬいが収まる高さ（背もたれの高さ・天井までの高さなど）。';
comment on column public.work_variants.fit_depth_mm is
  'ぬいが収まる奥行。足がはみ出すかどうかの判定に使う。';
comment on column public.work_variants.fit_source is
  'creator=STEP3でクリエイターが入力 / auto=メッシュから推定。推定値は表示時に but し書きを出す。';

-- 原寸で入力された内寸は、サイズ展開のときスケール比で伸ばす。
-- 0005 の sync_work_variant() とは別のトリガーにして、責務を混ぜない。
create or replace function public.scale_fit_dims() returns trigger
language plpgsql as $$
declare
  base record;
begin
  -- 基準バリアント（is_base）の内寸から、自分の scale_ratio 倍を入れる。
  -- 自分で値を持っている場合は触らない（サイズ専用データで内寸が変わることがある）。
  if new.is_base or new.fit_width_mm is not null then
    return new;
  end if;

  select fit_width_mm, fit_height_mm, fit_depth_mm into base
    from public.work_variants
   where work_id = new.work_id and is_base and id <> new.id
   limit 1;

  if base.fit_width_mm is not null then
    new.fit_width_mm  := round(base.fit_width_mm  * new.scale_ratio, 2);
    new.fit_height_mm := round(base.fit_height_mm * new.scale_ratio, 2);
    new.fit_depth_mm  := round(base.fit_depth_mm  * new.scale_ratio, 2);
    new.fit_source    := 'auto';
  end if;
  return new;
end;
$$;

create trigger work_variants_scale_fit
  before insert or update of scale_ratio on public.work_variants
  for each row execute function public.scale_fit_dims();

-- -----------------------------------------------------------------------------
-- 3-2. 相性判定
--
-- 合成イメージの見た目ではなく、数値で判定する。
-- 生成モデルの精度に可否が引きずられると、届いてから揉めるため。
-- -----------------------------------------------------------------------------
create type public.fit_verdict as enum (
  'too_small',  -- 入らない
  'tight',      -- ぴったり（余裕 5mm 未満）
  'good',       -- ちょうどいい
  'loose',      -- 余裕はあるが大きめ
  'unknown'     -- 内寸が未入力
);

create or replace function public.judge_axis(
  p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric default 40
) returns public.fit_verdict
language sql immutable as $$
  select case
    when p_slot_mm is null or p_nui_mm is null then 'unknown'::public.fit_verdict
    when p_slot_mm < p_nui_mm                  then 'too_small'
    when p_slot_mm - p_nui_mm < 5              then 'tight'
    when p_slot_mm - p_nui_mm > p_loose_mm     then 'loose'
    else 'good'
  end;
$$;

comment on function public.judge_axis is
  '1軸ぶんの判定。5mm 未満は「ぴったり」、40mm 超は「大きめ」。しきい値は表示文言と対応。';

-- バリアント1つ × ぬい1体の判定を3軸で返す
create or replace function public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid)
returns table (
  axis text,
  slot_mm numeric,
  nui_mm numeric,
  margin_mm numeric,
  verdict public.fit_verdict
)
language sql stable security definer set search_path = public as $$
  with v as (select * from public.work_variants where id = p_variant_id),
       n as (select * from public.nui_profiles   where id = p_nui_id)
  select a.axis, a.slot_mm, a.nui_mm,
         case when a.slot_mm is null or a.nui_mm is null then null
              else round(a.slot_mm - a.nui_mm, 1) end as margin_mm,
         public.judge_axis(a.slot_mm, a.nui_mm, a.loose_mm) as verdict
    from v, n,
    lateral (values
      ('width',  v.fit_width_mm,  coalesce(n.hug_width_mm, n.shoulder_width_mm), 40::numeric),
      ('height', v.fit_height_mm, n.sit_height_mm,                               40::numeric),
      ('depth',  v.fit_depth_mm,  coalesce(n.hug_width_mm, n.shoulder_width_mm), 60::numeric)
    ) as a(axis, slot_mm, nui_mm, loose_mm);
$$;

-- 総合判定。幅と高さが入らなければ too_small。奥行だけ足りないのは「足が前に出る」で通す。
create or replace function public.nui_fit_verdict(p_variant_id uuid, p_nui_id uuid)
returns public.fit_verdict
language sql stable security definer set search_path = public as $$
  with x as (select * from public.nui_fit_axes(p_variant_id, p_nui_id))
  select case
    when (select count(*) from x where verdict = 'unknown') = 3 then 'unknown'::public.fit_verdict
    when exists (select 1 from x where axis in ('width','height') and verdict = 'too_small') then 'too_small'
    when (select count(*) from x where verdict = 'loose') >= 2 then 'loose'
    when exists (select 1 from x where verdict = 'tight') then 'tight'
    else 'good'
  end;
$$;

-- 作品詳細の「サイズを選ぶ」1列ぶん。サイズごとに判定と一言を返す。
create or replace function public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid)
returns table (
  variant_id uuid,
  size_label text,
  nui_size_cm numeric,
  price_jpy integer,
  is_listed boolean,
  verdict public.fit_verdict,
  note text
)
language sql stable security definer set search_path = public as $$
  select v.id, v.size_label, v.nui_size_cm, v.price_jpy, v.is_listed,
         public.nui_fit_verdict(v.id, p_nui_id) as verdict,
         case public.nui_fit_verdict(v.id, p_nui_id)
           when 'too_small' then (select n.name from public.nui_profiles n where n.id = p_nui_id)
                                 || 'には小さすぎます'
           when 'tight'     then 'ぴったり収まります'
           when 'good'      then 'この子にちょうどいい'
           when 'loose'     then '余裕はあるが大きめ'
           else '内寸が未登録のため判定できません'
         end as note
    from public.work_variants v
   where v.work_id = p_work_id
   order by v.nui_size_cm nulls last, v.size_label;
$$;

comment on function public.nui_fit_for_work is
  '作品詳細「うちの子で見る」のサイズ一覧。判定は合成画像ではなく内寸の数値で出す。';

-- 内寸が未入力のバリアントを出品前に見つけるためのビュー（クリエイター向け）
create or replace view public.variants_missing_fit_dims as
select v.id as variant_id, v.work_id, w.title, w.creator_id, v.size_label, v.is_listed
  from public.work_variants v
  join public.works w on w.id = v.work_id
 where v.fit_width_mm is null or v.fit_height_mm is null or v.fit_depth_mm is null;

comment on view public.variants_missing_fit_dims is
  '内寸が未入力のバリアント。ここが埋まらないと「うちの子で見る」の判定が出せない。';

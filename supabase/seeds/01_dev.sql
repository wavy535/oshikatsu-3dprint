-- =============================================================================
-- 開発用シード（`supabase db reset` / `supabase start` で流れる）
--
-- マスタデータ（tags / filaments / printers / print_pricing_rules /
-- qc_check_definitions）は**マイグレーション側に入っている**ので、ここには書かない。
-- ここが用意するのは「画面を開いたときに中身がある」ための開発データだけ。
--
-- ログイン: 下の4アカウント。パスワードはすべて `password123`
--   buyer@example.com    … 買う人（マイぬい2体・お気に入りあり）
--   creator@example.com  … 作る人（作品4件）
--   creator2@example.com … 作る人その2（作品2件）
--   admin@example.com    … 運営
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. アカウント
--   auth.users に入れると on_auth_user_created が profiles と carts を作る。
--   パスワードログインには auth.identities の行も要る。
-- -----------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'buyer@example.com',    'ぬい活マニア', 'buyer'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'creator@example.com',  'みるく工房',   'creator'),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'creator2@example.com', 'ぷち家具店',   'creator'),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'admin@example.com',    'OshiNest運営', 'admin')
    ) as t(id, email, display_name, role)
  loop
    -- トークン系の列は NULL のままだと GoTrue が
    -- 「Database error querying schema」で落ちるので、空文字を入れる
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', u.display_name),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    update public.profiles
       set role = u.role::public.user_role,
           bio = case u.role
                   when 'creator' then '推しぬい向けの小物を作っています。'
                   else ''
                 end
     where id = u.id;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. 作品とサイズ展開
--   価格の下限は sync_work_variant が calc_print_fee から検証する。
--   ここでは「代行費 ÷ (1 - 手数料率) を 100円単位で切り上げ、+400円」を売価にして、
--   下限割れで弾かれないようにしている。
-- -----------------------------------------------------------------------------
do $$
declare
  w record;
  v record;
  work_id uuid;
  base_variant_id uuid;
  fee integer;
  floor_price integer;
  rule public.print_pricing_rules;
  tag_category uuid;
  tag_size uuid;
  tag_world uuid;
begin
  select * into rule from public.print_pricing_rules where is_active limit 1;

  for w in
    select * from (values
      -- creator_id, タイトル, 説明, カテゴリslug, 世界観slug, 内寸(幅/高さ/奥行mm), パーツ数
      ('22222222-2222-2222-2222-222222222222'::uuid, 'ふわもこ台座（丸型）',
       'ぬいをちょこんと座らせる丸い台座です。底に滑り止めの溝が入っています。',
       'daiza', 'retro', 124.0, 162.0, 105.0, 2),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'ミニチュアソファ',
       '座面が広めのソファ。背もたれが高いので、もたれさせても倒れません。',
       'kagu', 'retro', 132.0, 175.0, 118.0, 5),
      ('22222222-2222-2222-2222-222222222222'::uuid, '推し撮り用ミニ背景ボード',
       '差し替えできる背景ボード。スタンドと合わせて使います。',
       'haikei', 'wafu', 150.0, 210.0, 60.0, 3),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'おでかけキャリーケース',
       '持ち運び用のケース。中でぬいが動かないようクッション溝つき。',
       'case', 'cyber', 128.0, 168.0, 112.0, 6),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'ちいさな和室セット',
       '畳・座布団・ちゃぶ台の3点セット。和風の撮影に。',
       'kagu', 'wafu', 140.0, 150.0, 130.0, 7),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'アクスタ用スタンドラック',
       'アクリルスタンドを並べて飾れる階段状のラックです。',
       'komono', 'gothic', 118.0, 155.0, 96.0, 4)
    ) as t(creator_id, title, description, category_slug, world_slug,
           fit_w, fit_h, fit_d, parts)
  loop
    insert into public.works (creator_id, title, description, status,
                              accepts_color_change, accepts_stand_hole)
    values (w.creator_id, w.title, w.description, 'published', true, true)
    returning id into work_id;

    select id into tag_category from public.tags where type = 'category' and slug = w.category_slug;
    select id into tag_world    from public.tags where type = 'worldview' and slug = w.world_slug;
    insert into public.work_tags (work_id, tag_id) values (work_id, tag_category), (work_id, tag_world);

    -- 画像（storage の work-images バケット。実体は scripts/seed-storage.mjs が置く）
    insert into public.work_images (work_id, storage_path, sort_order)
    values (work_id, 'demo/' || replace(work_id::text, '-', '') || '-1.png', 0),
           (work_id, 'demo/' || replace(work_id::text, '-', '') || '-2.png', 1);

    -- サイズ展開。15cm を原寸（is_base）にして、10cm / 20cm はスケール比で持つ
    for v in
      select * from (values
        ('10cm', 10.0, 0.7000, false,  55.0,  2.40),
        ('15cm', 15.0, 1.0000, true,  120.0,  5.00),
        ('20cm', 20.0, 1.3500, false, 240.0,  9.00)
      ) as t(size_label, nui_size_cm, scale_ratio, is_base, grams, hours)
    loop
      fee := public.calc_print_fee(v.grams, v.hours, w.parts);
      floor_price := ceil(fee / (1 - rule.platform_fee_rate))::integer;

      insert into public.work_variants (
        work_id, size_label, nui_size_cm, scale_ratio, is_base,
        bbox_x_mm, bbox_y_mm, bbox_z_mm,
        max_part_bbox_x_mm, max_part_bbox_y_mm, max_part_bbox_z_mm,
        est_filament_grams, est_print_hours, part_count,
        price_jpy, stock, is_listed,
        fit_width_mm, fit_height_mm, fit_depth_mm
      ) values (
        work_id, v.size_label, v.nui_size_cm, v.scale_ratio, v.is_base,
        round((w.fit_w + 30) * v.scale_ratio, 2),
        round((w.fit_d + 30) * v.scale_ratio, 2),
        round((w.fit_h + 20) * v.scale_ratio, 2),
        round((w.fit_w + 30) * v.scale_ratio * 0.6, 2),
        round((w.fit_d + 30) * v.scale_ratio * 0.6, 2),
        round((w.fit_h + 20) * v.scale_ratio * 0.6, 2),
        v.grams, v.hours, w.parts,
        (ceil(floor_price / 100.0) * 100)::integer + 400,
        case v.size_label when '20cm' then 3 else 12 end,
        true,
        round(w.fit_w * v.scale_ratio, 2),
        round(w.fit_h * v.scale_ratio, 2),
        round(w.fit_d * v.scale_ratio, 2)
      )
      returning id into base_variant_id;
    end loop;
  end loop;
end $$;

-- 下書きの作品（作品管理の「下書き」表示を確認するため）
insert into public.works (creator_id, title, description, status)
values ('22222222-2222-2222-2222-222222222222', 'ためし置き用の小箱（下書き）',
        'まだ3Dデータを上げていない下書きです。', 'draft');

-- -----------------------------------------------------------------------------
-- 3. 買う人のデータ（マイぬい・お気に入り・配送先）
-- -----------------------------------------------------------------------------
insert into public.nui_profiles (user_id, name, kind, sit_height_mm, shoulder_width_mm, hug_width_mm, is_main)
values
  ('11111111-1111-1111-1111-111111111111', 'みるく', 'plush', 95.0, 62.0, 88.0, true),
  ('11111111-1111-1111-1111-111111111111', 'もか',   'plush', 148.0, 96.0, 132.0, false);

insert into public.addresses (user_id, recipient_name, postal_code, prefecture, city, address_line, phone, is_default)
values ('11111111-1111-1111-1111-111111111111', '推し活 花子', '1500001', '東京都', '渋谷区',
        '神宮前0-0-0 サンプルマンション101', '09000000000', true);

-- お気に入り（favorite_count はトリガーが集計する）
insert into public.work_favorites (user_id, work_id)
select '11111111-1111-1111-1111-111111111111', id
  from public.works where status = 'published' order by created_at limit 3;

-- -----------------------------------------------------------------------------
-- 4. 通知
--   通知はトリガーだけが作る決まりなので、シードでも push_notification() を通す
--   （直接 insert すると設定の判定や link_path の必須を素通ししてしまう）。
-- -----------------------------------------------------------------------------
do $$
declare
  buyer uuid := '11111111-1111-1111-1111-111111111111';
  w record;
begin
  select id, title into w from public.works where status = 'published' order by created_at limit 1;

  perform public.push_notification(
    buyer, 'favorite_price', 'お気に入りの作品が値下がりしました',
    w.title || ' が値下げされました', '/works/' || w.id);

  perform public.push_notification(
    buyer, 'message', 'みるく工房さんからメッセージが届きました',
    'オーダーメイドのご相談ありがとうございます。', '/mypage/messages');

  perform public.push_notification(
    buyer, 'announcement', 'マイぬいの採寸値を登録しませんか',
    '採寸値を入れると、作品に入るかどうかを数値で判定できます。', '/mypage/nuis');
end $$;

-- -----------------------------------------------------------------------------
-- 5. 注文（決済を通さずに購入履歴・注文詳細・受け取り評価を確認するため）
--   決済（Stripe）を入れたら create_print_jobs_for_order まで本物の経路が通るので、
--   ここは「その手前の状態を手で作る」だけにしてある。
-- -----------------------------------------------------------------------------
do $$
declare
  buyer uuid := '11111111-1111-1111-1111-111111111111';
  addr uuid;
  rule public.print_pricing_rules;
  o record;
  v record;
  order_id uuid;
  item_id uuid;
  unit integer;
  fee integer;
begin
  select * into rule from public.print_pricing_rules where is_active limit 1;
  select id into addr from public.addresses where user_id = buyer limit 1;

  for o in
    select * from (values
      ('paid'::public.order_status,      'ふわもこ台座（丸型）',     1, 3),
      ('shipped'::public.order_status,   'ミニチュアソファ',         1, 9),
      ('completed'::public.order_status, '推し撮り用ミニ背景ボード', 2, 21)
    ) as t(status, title, qty, days_ago)
  loop
    select v2.id, v2.price_jpy, v2.print_fee_jpy, v2.size_label, w.id as work_id, w.creator_id
      into v
      from public.work_variants v2
      join public.works w on w.id = v2.work_id
     where w.title = o.title and v2.size_label = '15cm';

    unit := v.price_jpy;
    fee  := coalesce(v.print_fee_jpy, 0);

    -- 代行費は price に上乗せして請求する（fee_billing = 'separate'）ので、
    -- 合計は 作品価格 + 印刷代行費 になる
    insert into public.orders (
      buyer_id, status, subtotal_amount, platform_fee_amount, print_cost_amount,
      total_amount, shipping_address_id, created_at, updated_at,
      shipped_at, tracking_number
    ) values (
      buyer, o.status, unit * o.qty,
      round(unit * o.qty * rule.platform_fee_rate), fee * o.qty,
      unit * o.qty + fee * o.qty, addr,
      now() - make_interval(days => o.days_ago), now() - make_interval(days => o.days_ago),
      case when o.status in ('shipped', 'completed')
           then now() - make_interval(days => o.days_ago - 2) end,
      case when o.status in ('shipped', 'completed') then '4567-8901-2345' end
    ) returning id into order_id;

    insert into public.order_items (
      order_id, work_id, creator_id, variant_id, size_label_snapshot,
      unit_price, quantity, creator_payout_amount, platform_fee_amount,
      print_cost_amount, print_fee_snapshot,
      stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot
    ) values (
      order_id, v.work_id, v.creator_id, v.id, v.size_label,
      unit, o.qty,
      unit * o.qty - round(unit * o.qty * rule.platform_fee_rate),
      round(unit * o.qty * rule.platform_fee_rate), fee * o.qty, fee,
      'work-stl/demo/' || v.work_id || '.3mf', 'PLA', 'ホワイト'
    ) returning id into item_id;
  end loop;
end $$;

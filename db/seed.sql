-- Development business fixtures. Account fixtures are created by scripts/db.mjs.
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
-- 身長だけが必須。もかは身長だけを登録した例（座高・幅は身長から推定される）
insert into public.nui_profiles (user_id, name, kind, height_mm, sit_height_mm, shoulder_width_mm, hug_width_mm, is_main)
values
  ('11111111-1111-1111-1111-111111111111', 'みるく', 'plush', 108.0, 95.0, 62.0, 88.0, true),
  ('11111111-1111-1111-1111-111111111111', 'もか',   'plush', 150.0, null, null, null, false);

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
  o_id uuid;
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
    -- 合計は 作品価格 + 印刷代行費 + 送料 になる（送料は決済がまだ無いので一律 520 円）
    insert into public.orders (
      buyer_id, status, subtotal_amount, platform_fee_amount, print_cost_amount,
      shipping_fee_amount, total_amount, shipping_address_id, created_at, updated_at,
      shipped_at, tracking_number
    ) values (
      buyer, o.status, unit * o.qty,
      round(unit * o.qty * rule.platform_fee_rate), fee * o.qty,
      520, unit * o.qty + fee * o.qty + 520, addr,
      now() - make_interval(days => o.days_ago), now() - make_interval(days => o.days_ago),
      case when o.status in ('shipped', 'completed')
           then now() - make_interval(days => o.days_ago - 2) end,
      case when o.status in ('shipped', 'completed') then '4567-8901-2345' end
    ) returning id into o_id;

    insert into public.order_items (
      order_id, work_id, creator_id, variant_id, size_label_snapshot,
      unit_price, quantity, creator_payout_amount, platform_fee_amount,
      print_cost_amount, print_fee_snapshot,
      stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot
    ) values (
      o_id, v.work_id, v.creator_id, v.id, v.size_label,
      unit, o.qty,
      unit * o.qty - round(unit * o.qty * rule.platform_fee_rate),
      round(unit * o.qty * rule.platform_fee_rate), fee * o.qty, fee,
      'work-stl/demo/' || v.work_id || '.3mf', 'PLA', 'ホワイト'
    ) returning id into item_id;

    -- 発送済み・取引完了の注文には、ジョブの実績と発送記録も入れる
    -- （運営の「出荷済み」一覧と、実費での精算が「確定」になる例を作るため）。
    -- apply_shipment() が status を shipped に戻すので、あとで元の status に直す
    if o.status in ('shipped', 'completed') then
      perform public.create_print_jobs_for_order(o_id);
      update public.print_jobs
         set status = 'qc_passed',
             printer_id = (select id from public.printers where code = 'P-01'),
             assignee_id = '44444444-4444-4444-4444-444444444444',
             batch_done = batch_count,
             actual_filament_grams = 118.0 * o.qty,
             actual_print_hours = 4.80 * o.qty
       where print_jobs.order_id = o_id;
      insert into public.filament_ledger (filament_id, delta_grams, reason, print_job_id, actor_id)
      select f.id, -118.0 * o.qty, 'print', j.id, '44444444-4444-4444-4444-444444444444'
        from public.print_jobs j
        join public.filaments f on f.material = 'PLA' and f.color_name = 'ホワイト'
       where j.order_id = o_id;

      insert into public.shipments (
        order_id, carrier, service_name, tracking_number, box_type,
        weight_grams, size_sum_cm, shipping_fee_jpy, shipped_at, packer_id
      ) values (
        o_id, 'yamato', '宅急便コンパクト', '4567-8901-2345', '宅急便コンパクト箱',
        180 + o.days_ago * 7, 52, 520,
        now() - make_interval(days => o.days_ago - 2),
        '44444444-4444-4444-4444-444444444444'
      );
      update public.orders set status = o.status where id = o_id;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. 印刷用のデータ（3Dデータ・パーツ・印刷指示・色スロット）
--   運営コンソールのジョブ詳細は「クリエイターが STEP1〜2 で入れたもの」を読む。
--   出品フローを毎回通さなくても中身が見えるように、ここで作っておく。
--   ファイル本体は置かない（storage_path だけ。3Dプレビューは未実装）。
-- -----------------------------------------------------------------------------
insert into public.work_assets (
  work_id, storage_path, file_name, file_format, file_size_bytes,
  object_count, triangle_count, bbox_x_mm, bbox_y_mm, bbox_z_mm,
  validation_status, validated_at, is_primary
)
select
  w.id, 'demo/' || w.id || '/model.3mf', 'model.3mf', '3mf', 4194304,
  v.part_count, 120000 + v.part_count * 8000,
  v.bbox_x_mm, v.bbox_y_mm, v.bbox_z_mm,
  'passed', now(), true
from public.works w
join public.work_variants v on v.work_id = w.id and v.is_base
where w.status = 'published';

update public.work_variants v
   set asset_id = a.id
  from public.work_assets a
 where a.work_id = v.work_id;

-- パーツ（3Dデータの中のオブジェクト）
with parts (title, idx, name) as (
  values
    ('ふわもこ台座（丸型）',       1, '台座本体'),
    ('ふわもこ台座（丸型）',       2, '滑り止めリング'),
    ('ミニチュアソファ',           1, '座面'),
    ('ミニチュアソファ',           2, '背もたれ'),
    ('ミニチュアソファ',           3, '肘掛け L'),
    ('ミニチュアソファ',           4, '肘掛け R'),
    ('ミニチュアソファ',           5, '脚'),
    ('推し撮り用ミニ背景ボード',   1, '背景ボード'),
    ('推し撮り用ミニ背景ボード',   2, 'スタンド脚'),
    ('推し撮り用ミニ背景ボード',   3, '差し替えフレーム'),
    ('おでかけキャリーケース',     1, 'ケース下'),
    ('おでかけキャリーケース',     2, 'ケース上'),
    ('おでかけキャリーケース',     3, 'ヒンジ L'),
    ('おでかけキャリーケース',     4, 'ヒンジ R'),
    ('おでかけキャリーケース',     5, '取っ手'),
    ('おでかけキャリーケース',     6, 'クッション仕切り'),
    ('ちいさな和室セット',         1, '畳ベース'),
    ('ちいさな和室セット',         2, '座布団 A'),
    ('ちいさな和室セット',         3, '座布団 B'),
    ('ちいさな和室セット',         4, 'ちゃぶ台 天板'),
    ('ちいさな和室セット',         5, 'ちゃぶ台 脚'),
    ('ちいさな和室セット',         6, '壁パネル'),
    ('ちいさな和室セット',         7, '障子枠'),
    ('アクスタ用スタンドラック',   1, 'ラック本体'),
    ('アクスタ用スタンドラック',   2, '段板 A'),
    ('アクスタ用スタンドラック',   3, '段板 B'),
    ('アクスタ用スタンドラック',   4, '背面支柱')
)
insert into public.work_asset_objects (
  asset_id, object_index, name, triangle_count,
  bbox_x_mm, bbox_y_mm, bbox_z_mm, volume_cm3, surface_area_cm2,
  is_manifold, min_wall_thickness_mm
)
select
  a.id, p.idx, p.name, 12000 + p.idx * 2500,
  60 + p.idx * 7, 45 + p.idx * 5, 18 + p.idx * 9,
  14 + p.idx * 3.5, 80 + p.idx * 12,
  true, 1.6 + (p.idx % 3) * 0.3
from parts p
join public.works w on w.title = p.title
join public.work_assets a on a.work_id = w.id;

-- パーツごとの印刷指示（4番目のパーツだけ立てて刷る＝サポートが要る、という作り）
insert into public.work_part_instructions (
  work_id, object_id, orientation, support, support_note, note
)
select
  w.id, o.id,
  case when o.object_index % 4 = 0 then 'upright' else 'flat' end::public.print_orientation,
  case when o.object_index % 4 = 0 then 'auto' else 'none' end::public.support_mode,
  case when o.object_index % 4 = 0 then 'ツリーサポート推奨。接地面は最小で' end,
  case when o.object_index = 1 then '底面を必ずベッド側に。立てると層間で割れます' end
from public.work_asset_objects o
join public.work_assets a on a.id = o.asset_id
join public.works w on w.id = a.work_id;

-- 色スロット（slot_index が最小のものが印刷キューの「素材・色」になる）
with slots (title, idx, source_name, material, color_name) as (
  values
    ('ふわもこ台座（丸型）',       1, '本体',           'PLA',  'ホワイト'),
    ('ミニチュアソファ',           1, '座面・背もたれ', 'PLA',  'ピンク'),
    ('ミニチュアソファ',           2, '脚',             'PLA',  'ホワイト'),
    ('推し撮り用ミニ背景ボード',   1, 'ボード',         'PETG', '生成り'),
    ('推し撮り用ミニ背景ボード',   2, 'フレーム',       'PLA',  'ブラック'),
    ('おでかけキャリーケース',     1, 'ケース',         'PLA',  'ブルー'),
    ('ちいさな和室セット',         1, '畳・障子',       'PETG', '生成り'),
    ('ちいさな和室セット',         2, '家具',           'PLA',  'グレー'),
    ('アクスタ用スタンドラック',   1, '本体',           'PLA',  'ブラック'),
    ('アクスタ用スタンドラック',   2, '段板',           'PLA',  'クリア')
)
insert into public.work_color_slots (
  work_id, asset_id, slot_index, source_name, source_hex, face_count, filament_id
)
select w.id, a.id, s.idx, s.source_name, f.color_hex, 40000 + s.idx * 5000, f.id
from slots s
join public.works w on w.title = s.title
join public.work_assets a on a.work_id = w.id
join public.filaments f
  on f.material = s.material::public.filament_material
 and f.color_name = s.color_name;

-- -----------------------------------------------------------------------------
-- 7. 印刷ジョブ（運営コンソールの印刷キューに中身を作る）
--   決済を入れたら create_print_jobs_for_order() が本物の経路で呼ばれる。
--   ここでは注文を手で作ってから同じ関数を呼び、ジョブの状態だけ進めてある。
--   ステータスは触っても注文側は sync_order_from_jobs() が導出する（設計判断9）。
-- -----------------------------------------------------------------------------
do $$
declare
  buyer uuid := '11111111-1111-1111-1111-111111111111';
  ops   uuid := '44444444-4444-4444-4444-444444444444';
  addr uuid;
  rule public.print_pricing_rules;
  o record;
  v record;
  new_order_id uuid;
  new_job_id uuid;
  unit_jpy integer;
  fee_jpy integer;
begin
  select * into rule from public.print_pricing_rules where is_active limit 1;
  select id into addr from public.addresses where user_id = buyer limit 1;

  for o in
    select * from (values
      -- 作品, サイズ, 個数, 出荷期限（時間後）, ジョブの状態, プリンタ, 済バッチ, 実績g, 実績h
      ('ふわもこ台座（丸型）',     '10cm', 1,  36, 'queued',   null,   0, null::numeric, null::numeric),
      ('ミニチュアソファ',         '15cm', 1,  18, 'printing', 'P-03', 1, null,          null),
      ('アクスタ用スタンドラック', '20cm', 2,  -6, 'queued',   null,   0, null,          null),
      ('推し撮り用ミニ背景ボード', '15cm', 1,  30, 'printed',  'P-01', 1, 128.0,         5.40),
      ('ちいさな和室セット',       '15cm', 1,  48, 'printed',  'P-02', 1, null,          null)
    ) as t(title, size_label, qty, due_hours, job_status, printer_code, batch_done,
           actual_g, actual_h)
  loop
    select v2.id, v2.price_jpy, v2.print_fee_jpy, v2.size_label, w.id as work_id, w.creator_id
      into v
      from public.work_variants v2
      join public.works w on w.id = v2.work_id
     where w.title = o.title and v2.size_label = o.size_label;

    unit_jpy := v.price_jpy;
    fee_jpy  := coalesce(v.print_fee_jpy, 0);

    insert into public.orders (
      buyer_id, status, subtotal_amount, platform_fee_amount, print_cost_amount,
      shipping_fee_amount, total_amount, shipping_address_id, ship_due_at, gift_wrapping,
      created_at, updated_at
    ) values (
      buyer, 'paid', unit_jpy * o.qty,
      round(unit_jpy * o.qty * rule.platform_fee_rate), fee_jpy * o.qty,
      520, unit_jpy * o.qty + fee_jpy * o.qty + 520, addr,
      now() + make_interval(hours => o.due_hours),
      o.title = '推し撮り用ミニ背景ボード',
      now() - interval '2 days', now() - interval '2 days'
    ) returning id into new_order_id;

    insert into public.order_items (
      order_id, work_id, creator_id, variant_id, size_label_snapshot,
      unit_price, quantity, creator_payout_amount, platform_fee_amount,
      print_cost_amount, print_fee_snapshot,
      stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot
    )
    select
      new_order_id, v.work_id, v.creator_id, v.id, v.size_label,
      unit_jpy, o.qty,
      unit_jpy * o.qty - round(unit_jpy * o.qty * rule.platform_fee_rate),
      round(unit_jpy * o.qty * rule.platform_fee_rate), fee_jpy * o.qty, fee_jpy,
      a.storage_path, f.material, f.color_name
    from public.work_assets a
    join public.work_color_slots cs on cs.work_id = a.work_id and cs.slot_index = 1
    join public.filaments f on f.id = cs.filament_id
    where a.work_id = v.work_id;

    perform public.create_print_jobs_for_order(new_order_id);

    select id into new_job_id from public.print_jobs where order_id = new_order_id limit 1;

    update public.print_jobs
       set status = o.job_status::public.print_job_status,
           printer_id = (select id from public.printers where code = o.printer_code),
           assignee_id = case when o.printer_code is not null then ops end,
           batch_done = o.batch_done,
           actual_filament_grams = o.actual_g,
           actual_print_hours = o.actual_h
     where id = new_job_id;

    -- 実績を入れたジョブは、その分のフィラメントを台帳から引いてある
    if o.actual_g is not null then
      insert into public.filament_ledger (filament_id, delta_grams, reason, print_job_id, actor_id)
      select cs.filament_id, -o.actual_g, 'print', new_job_id, ops
        from public.work_color_slots cs
       where cs.work_id = v.work_id and cs.slot_index = 1;
    end if;
  end loop;
end $$;

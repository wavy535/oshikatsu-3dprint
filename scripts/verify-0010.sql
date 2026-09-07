\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- 下ごしらえ
-- ---------------------------------------------------------------------------
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','c@e.com'),
 ('22222222-2222-2222-2222-222222222222','b@e.com'),
 ('33333333-3333-3333-3333-333333333333','o@e.com');
insert into public.profiles (id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','creator','yutuka_craft'),
 ('22222222-2222-2222-2222-222222222222','buyer','wavy'),
 ('33333333-3333-3333-3333-333333333333','admin','tanaka')
on conflict (id) do update set role=excluded.role, display_name=excluded.display_name;

insert into public.works (id,creator_id,title,status)
 values ('aaaaaaaa-0000-0000-0000-000000000001',
         '11111111-1111-1111-1111-111111111111','ミニチュアソファ（ブラウン）','published');

-- 原寸（15cm向け）。内寸は「座面の幅124 / 背もたれの高さ162 / 座面の奥行105」
insert into public.work_variants (id,work_id,size_label,nui_size_cm,scale_ratio,is_base,
  bbox_x_mm,bbox_y_mm,bbox_z_mm,est_filament_grams,est_print_hours,part_count,
  price_jpy,stock,is_listed,fit_width_mm,fit_height_mm,fit_depth_mm)
 values ('cccccccc-0000-0000-0000-000000000015','aaaaaaaa-0000-0000-0000-000000000001',
  '15cm',15,1.0,true, 150,110,170, 48.0,2.60,3, 1800,5,true, 124,162,105);

-- 10cm / 20cm は scale_ratio から内寸を引き継がせる（値は入れない）
insert into public.work_variants (id,work_id,size_label,nui_size_cm,scale_ratio,is_base,
  bbox_x_mm,bbox_y_mm,bbox_z_mm,est_filament_grams,est_print_hours,part_count,
  price_jpy,stock,is_listed)
 values
 ('cccccccc-0000-0000-0000-000000000010','aaaaaaaa-0000-0000-0000-000000000001',
  '10cm',10,0.6667, false, 100,73,113, 22.0,1.20,3, 1480,5,true),
 ('cccccccc-0000-0000-0000-000000000020','aaaaaaaa-0000-0000-0000-000000000001',
  '20cm',20,1.3333, false, 200,147,227, 96.0,5.20,3, 2400,3,true);

\echo ''
\echo '=== 1. サイズ展開で内寸がスケールされる（原寸だけ入力すればよい） ==='
select size_label, scale_ratio, fit_width_mm, fit_height_mm, fit_depth_mm, fit_source
  from public.work_variants where work_id='aaaaaaaa-0000-0000-0000-000000000001'
 order by nui_size_cm;

\echo ''
\echo '=== 2. マイぬい：座高からサイズ区分が決まり、1体目は自動でメインになる ==='
insert into public.nui_profiles (id,user_id,name,sit_height_mm,shoulder_width_mm,hug_width_mm)
 values ('99999999-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222',
         'みるく',150,85,120);
insert into public.nui_profiles (id,user_id,name,sit_height_mm,shoulder_width_mm,hug_width_mm)
 values ('99999999-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222',
         'こむぎ',100,60,85);
insert into public.nui_profiles (id,user_id,name,sit_height_mm,shoulder_width_mm,hug_width_mm)
 values ('99999999-0000-0000-0000-00000000000c','22222222-2222-2222-2222-222222222222',
         'ほし',200,110,155);
select name, sit_height_mm, nui_size_cm, is_main, has_scan from public.nui_profiles
 order by sit_height_mm;

\echo ''
\echo '=== 3. メインは1体だけ（2体目をメインにしようとすると弾かれる） ==='
savepoint sp_main;
\set ON_ERROR_STOP off
update public.nui_profiles set is_main=true where name='ほし';
\set ON_ERROR_STOP on
rollback to savepoint sp_main;

\echo ''
\echo '=== 4. アストラのスキャン：ready で has_scan が立ち、本人に通知が届く ==='
insert into public.nui_scans (id,nui_id,user_id,external_session_id,shot_count,status,
  measured_sit_height_mm,measured_shoulder_width_mm,measured_hug_width_mm,measure_confidence)
 values ('88888888-0000-0000-0000-000000000001','99999999-0000-0000-0000-00000000000a',
  '22222222-2222-2222-2222-222222222222','astra-sess-01',4,'generating',150.0,85.0,120.0,0.62);
update public.nui_scans set status='ready', duration_ms=28000
 where id='88888888-0000-0000-0000-000000000001';
select p.name, p.has_scan, s.status::text, s.shot_count, s.measure_confidence,
       (s.completed_at is not null) as completed,
       (s.photos_expire_at > now() + interval '29 days') as photos_expire_in_30d
  from public.nui_scans s join public.nui_profiles p on p.id=s.nui_id;
select kind::text, title, link_path from public.notifications
 where source_table='nui_scans';

\echo ''
\echo '=== 5. サイズの相性：3軸を数値で判定する（みるく 座高150 / 抱き幅120） ==='
select axis, slot_mm, nui_mm, margin_mm, verdict::text
  from public.nui_fit_axes('cccccccc-0000-0000-0000-000000000015',
                           '99999999-0000-0000-0000-00000000000a');

\echo ''
\echo '=== 6. サイズごとの総合判定と、画面に出す一言 ==='
select size_label, price_jpy, verdict::text, note
  from public.nui_fit_for_work('aaaaaaaa-0000-0000-0000-000000000001',
                               '99999999-0000-0000-0000-00000000000a');

\echo ''
\echo '=== 7. ほし（座高200 / 抱き幅155）だと 15cm は入らない ==='
select size_label, verdict::text, note
  from public.nui_fit_for_work('aaaaaaaa-0000-0000-0000-000000000001',
                               '99999999-0000-0000-0000-00000000000c');

\echo ''
\echo '=== 8. 内寸が未入力なら unknown（判定できないことを判定結果にする） ==='
savepoint sp_fit;
update public.work_variants set fit_width_mm=null, fit_height_mm=null, fit_depth_mm=null
 where size_label='15cm';
select size_label, verdict::text, note
  from public.nui_fit_for_work('aaaaaaaa-0000-0000-0000-000000000001',
                               '99999999-0000-0000-0000-00000000000a')
 where size_label='15cm';
select count(*) as missing_fit_dims from public.variants_missing_fit_dims;
rollback to savepoint sp_fit;

-- ---------------------------------------------------------------------------
-- 通知
-- ---------------------------------------------------------------------------
delete from public.notifications;

\echo ''
\echo '=== 9. 売れた → クリエイターに通知 ==='
insert into public.orders (id,buyer_id,status,subtotal_amount,total_amount,ship_due_at)
 values ('dddddddd-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
         'paid',1800,2639,now()+interval '4 days');
insert into public.order_items (id,order_id,work_id,creator_id,variant_id,unit_price,quantity,
  creator_payout_amount,platform_fee_amount,print_cost_amount,
  stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot,
  size_label_snapshot,print_fee_snapshot)
 values ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  'cccccccc-0000-0000-0000-000000000015',1800,1,1620,180,339,
  'works/x/sofa.3mf','PLA','ブラウン','15cm',339);
select kind::text, title, body, link_path from public.notifications
 where user_id='11111111-1111-1111-1111-111111111111';

\echo ''
\echo '=== 10. 印刷開始 → 購入者に通知 ==='
select public.create_print_jobs_for_order('dddddddd-0000-0000-0000-000000000001') as jobs;
update public.print_jobs set status='printing';
select kind::text, title, body, link_path from public.notifications
 where user_id='22222222-2222-2222-2222-222222222222';

\echo ''
\echo '=== 11. 発送 → 購入者に通知（同じ発送で2回は作らない） ==='
update public.print_jobs set status='printed';
update public.print_jobs set status='qc_passed';
insert into public.shipments (id,order_id,carrier,service_name,tracking_number,shipping_fee_jpy)
 values ('77777777-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
         'yamato','宅急便コンパクト','4712-3388-9021',520);
select title, body from public.notifications where source_table='shipments';
select count(*) as shipment_notifications from public.notifications where source_table='shipments';

\echo ''
\echo '=== 12. メッセージ → 宛先に通知 ==='
insert into public.messages (sender_id,recipient_id,body)
 values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
         'サイズの件、承知しました。データを差し替えます');
select kind::text, title, body from public.notifications where source_table='messages';

\echo ''
\echo '=== 13. 値下げ → お気に入りに入れている人に通知 ==='
insert into public.work_favorites (user_id,work_id)
 values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001');
-- 最安値（10cmの1480円）が下がったときだけ「値下げ」とみなす
select min_price_jpy as min_before from public.works where id='aaaaaaaa-0000-0000-0000-000000000001';
update public.work_variants set price_jpy=1180 where size_label='10cm';
select min_price_jpy as min_after, previous_min_price_jpy as prev
  from public.works where id='aaaaaaaa-0000-0000-0000-000000000001';
select kind::text, title, body from public.notifications where source_table='works_price';

\echo ''
\echo '=== 14. 通知設定でお気に入り通知を切ると、次の値下げでは作られない ==='
insert into public.notification_preferences (user_id,kind,in_app,email,push)
 values ('22222222-2222-2222-2222-222222222222','favorite_price',false,false,false);
update public.work_variants set price_jpy=980 where size_label='10cm';
select count(*) as price_notifications from public.notifications where source_table='works_price';

\echo ''
\echo '=== 15. 発送通知はアプリ内でオフにできない（DB側でも止める） ==='
savepoint sp_pref;
\set ON_ERROR_STOP off
insert into public.notification_preferences (user_id,kind,in_app)
 values ('22222222-2222-2222-2222-222222222222','order_shipping',false);
\set ON_ERROR_STOP on
rollback to savepoint sp_pref;

\echo ''
\echo '=== 16. 修正依頼 → クリエイターに通知 ==='
update public.print_jobs set status='printed';
insert into public.qc_inspections (print_job_id,inspector_id,result,memo,reprint_cause,photo_paths)
 select id,'33333333-3333-3333-3333-333333333333','failed',
  '座面のダボがきつく、はめ合いに力が要ります。0.15mm ほどクリアランスを取ってください。',
  'model', array['qc/1.jpg'] from public.print_jobs limit 1;
select kind::text, title, body from public.notifications where source_table='revision_requests';

\echo ''
\echo '=== 17. レビュー → クリエイターに通知 ==='
insert into public.reviews (order_item_id,reviewer_id,work_id,creator_id,rating,
  design_rating,accuracy_rating,size_fit_rating,comment)
 values ('eeeeeeee-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  5,5,5,5,'うちの子にぴったりでした');
select kind::text, title, body from public.notifications where source_table='reviews';

\echo ''
\echo '=== 18. 見積りの提示 → 相談した人に通知 ==='
insert into public.custom_order_requests (id,requester_id,creator_id,message)
 values ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
         '11111111-1111-1111-1111-111111111111','推しぬい用のベッドを作ってほしいです');
insert into public.custom_order_quotes (request_id,creator_id,buyer_id,status,
  price_jpy,print_fee_jpy,shipping_fee_jpy,est_filament_grams,est_print_hours,part_count)
 values ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222','sent',3600,801,520,120.0,6.10,5);
select kind::text, title, body from public.notifications where source_table='custom_order_quotes';

\echo ''
\echo '=== 19. 通知一覧（購入者の画面に出る順） ==='
select kind::text, title, link_path, (read_at is null) as unread
  from public.notifications
 where user_id='22222222-2222-2222-2222-222222222222'
 order by created_at desc;

\echo ''
\echo '=== 20. 未読件数と「すべて既読にする」 ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.unread_notification_count() as unread_before;
select public.mark_all_notifications_read() as marked;
select public.unread_notification_count() as unread_after;
reset request.jwt.claim.sub;

\echo ''
\echo '=== 21. 行き先のない通知は作れない（link_path は必須） ==='
savepoint sp_link;
\set ON_ERROR_STOP off
insert into public.notifications (user_id,kind,title)
 values ('22222222-2222-2222-2222-222222222222','announcement','行き先のないお知らせ');
\set ON_ERROR_STOP on
rollback to savepoint sp_link;

\echo ''
\echo '=== 22. RLS：他人の通知は見えない ==='
-- Supabase は public スキーマに既定の GRANT を持つ。ローカル検証では手で付ける。
grant select on public.notifications, public.nui_profiles to authenticated;
insert into public.notifications (user_id,kind,title,link_path)
 values ('11111111-1111-1111-1111-111111111111','creator','クリエイター宛の通知','/creator/sales');
select count(*) as all_rows from public.notifications;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as visible_to_buyer from public.notifications;
select count(*) as own_nui from public.nui_profiles;
reset role;

\echo ''
\echo '=== 23. 30日より古い通知は自動で消す ==='
update public.notifications set created_at = now() - interval '40 days'
 where source_table='messages';
select public.purge_old_notifications() as purged;

rollback;

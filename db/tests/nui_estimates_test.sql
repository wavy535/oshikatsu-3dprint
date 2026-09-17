begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to app_guest, app_user, app_service;
set local search_path = public, extensions;
select no_plan();

-- 推定の比率は src/lib/nuis/config.ts の NUI_PROPORTIONS と同じ値にそろえる（tests/nui-dimensions.test.ts も同じ値を検査する）
select is(public.nui_sit_height_ratio(), 0.88, 'sit height ratio matches NUI_PROPORTIONS.sitHeightPerHeight');
select is(public.nui_width_ratio(), 0.57, 'width ratio matches NUI_PROPORTIONS.widthPerHeight');

insert into public.app_users (id, email) values
  ('12000000-0000-4000-8000-000000000001', 'nui-owner@example.invalid'),
  ('12000000-0000-4000-8000-000000000002', 'nui-creator@example.invalid');

insert into public.nui_profiles (id, user_id, name, height_mm, sit_height_mm, shoulder_width_mm, hug_width_mm) values
  ('72000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '身長だけ', 150, null, null, null),
  ('72000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', '全部入力', 150, 140, 70, 90),
  ('72000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000001', '肩幅だけ', 150, null, 70, null),
  ('72000000-0000-4000-8000-000000000004', '12000000-0000-4000-8000-000000000001', '端数', 145, null, null, null);

select throws_ok($$insert into public.nui_profiles (user_id, name, sit_height_mm) values ('12000000-0000-4000-8000-000000000001', '身長なし', 130)$$,
  '23502', null, 'the height is required');
select throws_ok($$insert into public.nui_profiles (user_id, name, height_mm) values ('12000000-0000-4000-8000-000000000001', '身長0', 0)$$,
  '23514', null, 'the height must be positive');

select is((select nui_size_cm from public.nui_profiles where id = '72000000-0000-4000-8000-000000000001'), 15.0, 'the size class comes from the height');
update public.nui_profiles set height_mm = 120 where id = '72000000-0000-4000-8000-000000000001';
select is((select nui_size_cm from public.nui_profiles where id = '72000000-0000-4000-8000-000000000001'), 10.0, 'changing the height updates the size class');
update public.nui_profiles set height_mm = 150 where id = '72000000-0000-4000-8000-000000000001';

select is((select public.nui_sit_height_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000001'), 132.0, 'a missing sit height is estimated from the height');
select is((select public.nui_width_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000001'), 85.5, 'missing widths are estimated from the height');
select is((select public.nui_sit_height_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000002'), 140.0, 'an entered sit height wins over the estimate');
select is((select public.nui_width_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000002'), 90.0, 'the hug width wins over the shoulder width');
select is((select public.nui_width_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000003'), 70.0, 'the shoulder width is used without a hug width');
select is((select public.nui_width_mm(n) from public.nui_profiles n where n.id = '72000000-0000-4000-8000-000000000004'), 82.7, '145 x 0.57 = 82.65 rounds half up like the TypeScript estimate');

insert into public.works (id, creator_id, title, status) values
  ('32000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', '相性の推定テスト', 'published');
insert into public.work_variants (id, work_id, size_label, price_jpy, stock, is_listed, is_base, bbox_x_mm, bbox_y_mm, bbox_z_mm,
    est_filament_grams, est_print_hours, fit_width_mm, fit_height_mm, fit_depth_mm) values
  ('42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '15cm', 1000, 1, true, true, 10, 10, 10,
    1, 1, 100, 150, 200);

select results_eq(
  $$select axis, nui_mm, verdict::text from public.nui_fit_axes('42000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001') order by axis$$,
  $$values ('depth'::text, 85.5::numeric, 'loose'::text), ('height', 132.0, 'good'), ('width', 85.5, 'good')$$,
  'fit axes use the estimates for a nui registered with its height only');
select is(public.nui_fit_verdict('42000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001')::text, 'good',
  'a nui registered with its height only gets a verdict instead of unknown');
select results_eq(
  $$select axis, nui_mm from public.nui_fit_axes('42000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002') order by axis$$,
  $$values ('depth'::text, 90.0::numeric), ('height', 140.0), ('width', 90.0)$$,
  'fit axes keep using entered measurements');

select * from finish();
rollback;

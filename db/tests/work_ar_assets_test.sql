begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to app_guest, app_user, app_service;
set local search_path = public, extensions;
select no_plan();
insert into app_users (id,email) values
  ('18000000-0000-4000-8000-000000000001','ar-owner@example.invalid'),
  ('18000000-0000-4000-8000-000000000002','ar-other@example.invalid');
insert into works (id,creator_id,title,status) values
  ('38000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001','AR test','draft');
set local role app_user;
select set_config('app.user_id','18000000-0000-4000-8000-000000000001',true), set_config('app.role','app_user',true);
select lives_ok($$insert into work_ar_assets (work_id,storage_path,file_name,file_format,file_size_bytes) values
  ('38000000-0000-4000-8000-000000000001','ar/original.stl','assembled.stl','stl',100)$$, 'owner registers dedicated AR data');
select set_config('app.user_id','18000000-0000-4000-8000-000000000002',true);
select is((select count(*) from work_ar_assets where work_id='38000000-0000-4000-8000-000000000001'),0::bigint,'another user cannot read a draft AR asset');
with changed as (update work_ar_assets set storage_path='stolen.stl' where work_id='38000000-0000-4000-8000-000000000001' returning 1) select is((select count(*) from changed),0::bigint,'another user cannot replace AR data');
reset role;
update works set status='published' where id='38000000-0000-4000-8000-000000000001';
set local role app_guest;
select set_config('app.user_id','',true), set_config('app.role','app_guest',true);
select is((select storage_path from work_ar_assets where work_id='38000000-0000-4000-8000-000000000001'),'ar/original.stl','guests read published AR metadata');
select ok(not has_table_privilege('app_guest','public.work_ar_assets','insert'), 'guests cannot register AR data');
reset role;
select * from finish();
rollback;

\set ON_ERROR_STOP off

-- =============================================================================
-- 0022〜0023 の動作確認（開発シードが入った DB に対して流す。各節は rollback する）
--
--   docker exec -i supabase_db_osinest psql -U postgres -d postgres < scripts/verify-0022-0023.sql
--
-- 見るもの:
--   1. 一般ユーザーの自己昇格（profiles.role = admin）が止まる
--   2. 承認トリガー（0004）経由の role 変更は通る
--   3. grant_admin / revoke_admin の判定（非運営・未登録・二重・自分・非運営の解除・復元）
--   4. 期限切れの見積りを閉じると両者に通知が出る。authenticated は expire を呼べない
--   5. notification_email_targets は service_role だけが呼べる
-- 「ERROR:」が出る行はすべて期待どおりのエラー（直前の \echo に何を期待するか書いてある）。
-- =============================================================================

\echo ''
\echo '=== 1. 買う人の自己昇格 → ERROR（role は運営だけが変更できます）==='
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' returning role;
rollback;

\echo ''
\echo '=== 2. 運営が申請を承認 → buyer が creator になる ==='
begin;
insert into public.creator_applications (id, user_id, message)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'テスト申請テスト申請テスト申請テスト申請');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',true);
update public.creator_applications set status = 'approved', reviewed_by = '44444444-4444-4444-4444-444444444444'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select role as expect_creator from public.profiles where id = '11111111-1111-1111-1111-111111111111';
rollback;

\echo ''
\echo '=== 3. grant_admin / revoke_admin ==='
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
\echo '-- 非運営が呼ぶ → ERROR'
savepoint s; select public.grant_admin('creator@example.com'); rollback to s;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',true);
\echo '-- 一覧（運営1人）'
select email from public.list_admin_members();
\echo '-- 未登録メール → ERROR'
savepoint s; select public.grant_admin('nobody@example.com'); rollback to s;
\echo '-- creator を昇格（前後の空白・大文字は無視）'
select public.grant_admin(' Creator@Example.com ');
select role, role_before_admin from public.profiles where id = '22222222-2222-2222-2222-222222222222';
\echo '-- 二重昇格 → ERROR'
savepoint s; select public.grant_admin('creator@example.com'); rollback to s;
\echo '-- 自分を解除 → ERROR'
savepoint s; select public.revoke_admin('44444444-4444-4444-4444-444444444444'); rollback to s;
\echo '-- 昇格した creator を解除 → creator に戻る'
select public.revoke_admin('22222222-2222-2222-2222-222222222222');
select role as expect_creator, role_before_admin as expect_null from public.profiles where id = '22222222-2222-2222-2222-222222222222';
\echo '-- 運営でない人を解除 → ERROR'
savepoint s; select public.revoke_admin('11111111-1111-1111-1111-111111111111'); rollback to s;
rollback;

\echo ''
\echo '=== 4. 期限切れ → 通知2件 ==='
begin;
\echo '-- authenticated は expire_custom_quotes を呼べない → ERROR'
set local role authenticated;
savepoint s; select public.expire_custom_quotes(); rollback to s;
reset role;
insert into public.custom_order_requests (id, requester_id, creator_id, message, status)
  values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '期限テスト', 'responded');
insert into public.custom_order_quotes (id, request_id, creator_id, buyer_id, status, price_jpy, print_fee_jpy, shipping_fee_jpy, expires_at)
  values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'sent', 3000, 500, 600, now() - interval '1 hour');
delete from public.notifications where source_id = 'cccccccc-0000-0000-0000-000000000001';
select public.expire_custom_quotes() as expect_1;
select kind, title, link_path from public.notifications where source_id = 'cccccccc-0000-0000-0000-000000000001' order by kind;
\echo '-- cron に登録されている'
select jobname, schedule from cron.job where jobname = 'expire-custom-quotes';
rollback;

\echo ''
\echo '=== 5. notification_email_targets ==='
begin; set local role authenticated;
\echo '-- authenticated → ERROR（permission denied）'
savepoint s; select count(*) from public.notification_email_targets(10); rollback to s;
reset role; set local role service_role;
\echo '-- service_role → 宛先つきで返る'
select email, digest, digest_hour, kind, title from public.notification_email_targets(3);
rollback;

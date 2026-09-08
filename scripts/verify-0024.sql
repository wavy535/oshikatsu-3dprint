-- 0024 の検証: クリエイター申請は SMS 認証済み + 規約同意が無いと作れない
--   docker exec -i supabase_db_osinest psql -U postgres -d postgres < scripts/verify-0024.sql
-- 最後に rollback するので何度でも流せる。拒否されるケースは savepoint で区切る。
\set ON_ERROR_STOP off
begin;

-- 検証用の buyer（シードの buyer@example.com）を使う
select id as buyer_id from auth.users where email = 'buyer@example.com' \gset

-- まず電話未認証の状態にしておく
update auth.users set phone = null, phone_confirmed_at = null where id = :'buyer_id';
update public.profiles set role = 'buyer' where id = :'buyer_id';
delete from public.creator_applications where user_id = :'buyer_id';

\echo '-- 1. 規約に同意していない → terms_not_agreed で拒否'
savepoint c1;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'buyer_id', 'role', 'authenticated')::text, true) \gset
insert into public.creator_applications (user_id, message)
values (:'buyer_id', '検証用の申請メッセージです。20文字以上にしてあります。');
rollback to savepoint c1;

\echo '-- 2. 規約には同意したが電話が未認証 → phone_not_verified で拒否'
savepoint c2;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'buyer_id', 'role', 'authenticated')::text, true) \gset
insert into public.creator_applications (user_id, message, terms_version)
values (:'buyer_id', '検証用の申請メッセージです。20文字以上にしてあります。', '2026-09-08');
rollback to savepoint c2;

\echo '-- 3. 電話を認証済みにすると通り、番号と同意時刻がトリガーで入る（偽の番号を渡しても上書き）'
update auth.users set phone = '819000000001', phone_confirmed_at = now() where id = :'buyer_id';
savepoint c3;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'buyer_id', 'role', 'authenticated')::text, true) \gset
insert into public.creator_applications (user_id, message, terms_version, phone, phone_verified_at)
values (:'buyer_id', '検証用の申請メッセージです。20文字以上にしてあります。', '2026-09-08',
        '+810000000000', '2000-01-01');
reset role;
select phone, phone_verified_at > '2001-01-01' as verified_from_auth, terms_version,
       terms_agreed_at is not null as agreed
  from public.creator_applications where user_id = :'buyer_id';

\echo '-- 4. portfolio_url は http(s) だけ → check 制約で拒否'
savepoint c4;
insert into public.creator_applications (user_id, message, terms_version, portfolio_url)
values (:'buyer_id', 'x', '2026-09-08', 'javascript:alert(1)');
rollback to savepoint c4;

rollback;

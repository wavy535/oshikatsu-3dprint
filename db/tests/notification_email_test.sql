begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to app_guest, app_user, app_service;
set local search_path = public, extensions;
select no_plan();

-- このテスト以外の既存通知はトランザクション内で配信済みに退避する。
update public.notifications set emailed_at = now();
insert into public.app_users (id, email) values
  ('16000000-0000-4000-8000-000000000001', 'mail-daily@example.invalid'),
  ('16000000-0000-4000-8000-000000000002', 'mail-instant@example.invalid');
insert into public.notification_settings (user_id, digest, digest_hour) values
  ('16000000-0000-4000-8000-000000000001', 'daily', (extract(hour from now() at time zone 'Asia/Tokyo')::int + 1) % 24)
  on conflict (user_id) do update set digest = excluded.digest, digest_hour = excluded.digest_hour;
insert into public.notifications (user_id, kind, title, link_path, created_at)
select '16000000-0000-4000-8000-000000000001', 'announcement', 'daily', '/mypage/notifications', now() - interval '1 hour'
from generate_series(1, 201);
insert into public.notifications (id, user_id, kind, title, link_path) values
  ('76000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'announcement', 'instant', '/mypage/notifications');

select ok(not has_function_privilege('app_guest', 'public.claim_notification_emails(uuid, integer)', 'execute'), 'anonymous callers cannot claim notifications');
select ok(not has_function_privilege('app_user', 'public.claim_notification_emails(uuid, integer)', 'execute'), 'users cannot claim notifications');
set local role app_user;
select set_config('app.user_id', '16000000-0000-4000-8000-000000000002', true), set_config('app.role', 'app_user', true);
select throws_ok($$update public.notifications set emailed_at = now() where id = '76000000-0000-4000-8000-000000000001'$$, '42501', null, 'users cannot fabricate email acknowledgements');
select throws_ok($$update public.notifications set email_claimed_until = now() where id = '76000000-0000-4000-8000-000000000001'$$, '42501', null, 'users cannot tamper with delivery leases');
select lives_ok($$update public.notifications set read_at = now() where id = '76000000-0000-4000-8000-000000000001'$$, 'users can still mark their notifications as read');
reset role;

set local role app_service;
select set_config('app.user_id', '', true), set_config('app.role', 'app_service', true);
select is((select id from public.notification_email_targets(1)), '76000000-0000-4000-8000-000000000001'::uuid, '201 deferred daily notifications cannot starve instant delivery');
select is((select count(*) from public.claim_notification_emails('86000000-0000-4000-8000-000000000001', 20)), 1::bigint, 'worker claims the due notification');
select ok((select emailed_at is null and email_claimed_until > now() from public.notifications where id = '76000000-0000-4000-8000-000000000001'), 'claim is not a delivery acknowledgement');
select is((select count(*) from public.claim_notification_emails('86000000-0000-4000-8000-000000000002', 20)), 0::bigint, 'another worker cannot claim the leased notification');
update public.notifications set email_claimed_until = now() - interval '1 second' where id = '76000000-0000-4000-8000-000000000001';
select is((select count(*) from public.claim_notification_emails('86000000-0000-4000-8000-000000000002', 20)), 1::bigint, 'expired leases recover after a process crash');
update public.notifications set emailed_at = now() where email_claim_token = '86000000-0000-4000-8000-000000000001';
select ok((select emailed_at is null from public.notifications where id = '76000000-0000-4000-8000-000000000001'), 'a stale worker cannot acknowledge the new claim');
update public.notifications set emailed_at = now(), email_claim_token = null, email_claimed_until = null
  where email_claim_token = '86000000-0000-4000-8000-000000000002';
select is((select count(*) from public.claim_notification_emails('86000000-0000-4000-8000-000000000003', 20)), 0::bigint, 'delivered notifications are not claimed again');
reset role;

update public.notification_settings set digest_hour = extract(hour from now() at time zone 'Asia/Tokyo')::int
  where user_id = '16000000-0000-4000-8000-000000000001';
set local role app_service;
select is((select count(*) from public.notification_email_targets(20)), 20::bigint, 'daily notifications become eligible at their configured hour with a batch limit');
reset role;
insert into public.notification_preferences (user_id, kind, email) values
  ('16000000-0000-4000-8000-000000000001', 'announcement', false)
  on conflict (user_id, kind) do update set email = false;
set local role app_service;
select is((select count(*) from public.notification_email_targets(20)), 0::bigint, 'email opt-out remains effective');
reset role;

select * from finish();
rollback;

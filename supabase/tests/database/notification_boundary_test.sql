begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-000000000001', 'notification-sender@example.invalid'),
  ('50000000-0000-4000-8000-000000000002', 'notification-recipient@example.invalid');
insert into public.notifications (id, user_id, kind, title, link_path, created_at, read_at) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'message', 'old fixture', '/mypage/messages', now() - interval '31 days', now()),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'message', 'recent fixture', '/mypage/messages', now(), null);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.push_notification(null, 'message', 'test', '', '/mypage/messages')$$,
  '42501', null, 'anonymous callers cannot create notifications directly');
select throws_ok($$select public.purge_old_notifications()$$,
  '42501', null, 'anonymous callers cannot run notification maintenance');
select throws_ok($$select public.mark_all_notifications_read()$$,
  '42501', null, 'anonymous callers cannot invoke notification updates');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.push_notification('50000000-0000-4000-8000-000000000002', 'message', 'test', '', '/mypage/messages')$$,
  '42501', null, 'users cannot create notifications for another user');
select throws_ok($$select public.purge_old_notifications()$$,
  '42501', null, 'users cannot delete notifications through the maintenance RPC');

-- Ordinary application writes still create notifications through their DB triggers.
select lives_ok($$
  insert into public.messages (id, sender_id, recipient_id, body)
  values ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'transaction-only test message')
$$, 'sending a message still executes the notification trigger');
select is(public.mark_all_notifications_read(), 0,
  'the sender cannot mark the recipient notifications as read');
reset role;

select is((select count(*) from public.notifications
  where user_id = '50000000-0000-4000-8000-000000000002'
    and source_table = 'messages' and source_id = '70000000-0000-4000-8000-000000000001'),
  1::bigint, 'the trigger creates exactly one notification for the recipient');
select is((select read_at from public.notifications where id = '60000000-0000-4000-8000-000000000002'),
  null::timestamptz, 'another user cannot change the recipient read status');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.mark_all_notifications_read(), 2,
  'the recipient can mark their unread notifications as read');
select is(public.mark_all_notifications_read(), 0,
  'marking notifications as read is idempotent');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select public.push_notification(null, 'message', 'test', '', '/mypage/messages')$$,
  '42501', null, 'notification creation remains internal to DB triggers');
select lives_ok($$select public.purge_old_notifications()$$,
  'trusted maintenance can still purge old notifications');
reset role;

select ok(not exists (select 1 from public.notifications where id = '60000000-0000-4000-8000-000000000001'),
  'maintenance removes the old fixture');
select ok(exists (select 1 from public.notifications where id = '60000000-0000-4000-8000-000000000002'),
  'maintenance preserves the recent fixture');

select * from finish();
rollback;

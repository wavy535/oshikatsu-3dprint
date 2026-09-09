begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to app_guest, app_user, app_service;
set local search_path = public, extensions;
select no_plan();

-- Fixtures belong to this transaction; no development seed accounts are required.
-- Users: 1 = buyer, 2 = another buyer, 3 = creator, 4 = admin.
insert into public.app_users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'rpc-buyer@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'rpc-other@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'rpc-creator@example.invalid'),
  ('10000000-0000-4000-8000-000000000004', 'rpc-admin@example.invalid');
update public.profiles set role = 'creator' where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000004';

insert into public.orders (id, buyer_id, status, subtotal_amount, total_amount)
select id, '10000000-0000-4000-8000-000000000001', status, 1000, 1000
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'payment_pending'::public.order_status),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'payment_pending'::public.order_status),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'payment_pending'::public.order_status),
  ('20000000-0000-4000-8000-000000000004'::uuid, 'paid'::public.order_status)
) as fixture(id, status);

insert into public.custom_order_requests (id, requester_id, creator_id, message) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'accept test'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'decline test');
insert into public.custom_order_quotes
  (id, quote_no, request_id, creator_id, buyer_id, status, price_jpy, est_filament_grams, est_print_hours)
values
  ('30000000-0000-4000-8000-000000000001', 'RPC-AUTH-ACCEPT', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'sent', 3000, 80, 4),
  ('30000000-0000-4000-8000-000000000002', 'RPC-AUTH-DECLINE', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'sent', 3000, 80, 4);

-- Exercise the actual database roles, not only Next.js guards.
set local role app_guest;
select set_config('app.user_id', '', true), set_config('app.role', 'app_guest', true);
select throws_ok($$select public.cancel_unpaid_order('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'anonymous callers cannot invoke order cancellation');
select throws_ok($$select public.place_order('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'anonymous callers cannot invoke checkout');
select throws_ok($$select public.accept_custom_quote('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'anonymous callers cannot invoke quote acceptance');
select throws_ok($$select public.decline_custom_quote('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'anonymous callers cannot invoke quote rejection');
reset role;

set local role app_user;
select set_config('app.user_id', '10000000-0000-4000-8000-000000000002', true), set_config('app.role', 'app_user', true);
select throws_ok($$select public.cancel_unpaid_order('20000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'another buyer cannot cancel the order');
select throws_ok($$select public.accept_custom_quote('30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'another buyer cannot accept the quote');
select throws_ok($$select public.decline_custom_quote('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'another buyer cannot decline the quote');
select throws_ok($$select public.confirm_order_payment('20000000-0000-4000-8000-000000000001', 'test')$$,
  '42501', null, 'buyers cannot mark orders as paid');
reset role;

select is((select status::text from public.orders where id = '20000000-0000-4000-8000-000000000001'),
  'payment_pending', 'denied cancellation leaves the order unchanged');
select is((select count(*) from public.custom_order_quotes where quote_no like 'RPC-AUTH-%' and status = 'sent'),
  2::bigint, 'denied quote actions leave both quotes unchanged');

set local role app_user;
select set_config('app.user_id', '10000000-0000-4000-8000-000000000001', true), set_config('app.role', 'app_user', true);
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000001'), true,
  'the buyer can cancel an unpaid order');
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000001'), false,
  'repeated cancellation is a no-op');
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000004'), false,
  'the buyer cannot cancel a paid order');
select lives_ok($$select public.accept_custom_quote('30000000-0000-4000-8000-000000000001')$$,
  'the intended buyer can accept the quote');
select is(public.decline_custom_quote('30000000-0000-4000-8000-000000000002'), true,
  'the intended buyer can decline the quote');
reset role;

select is((select status::text from public.orders where id = '20000000-0000-4000-8000-000000000001'),
  'cancelled', 'successful cancellation persists the status');
select is((select count(*) from public.order_status_history where order_id = '20000000-0000-4000-8000-000000000001' and status = 'cancelled'),
  1::bigint, 'repeated cancellation does not duplicate history');
select is((select changed_by from public.order_status_history where order_id = '20000000-0000-4000-8000-000000000001' and status = 'cancelled'),
  '10000000-0000-4000-8000-000000000001'::uuid, 'cancellation records the buyer as the actor');
select ok(exists (
  select 1 from public.custom_order_quotes q
  join public.work_variants v on v.id = q.variant_id
  join public.cart_items ci on ci.variant_id = v.id
  join public.carts c on c.id = ci.cart_id
  where q.id = '30000000-0000-4000-8000-000000000001'
    and q.status = 'accepted' and not v.is_listed and v.stock = 1
    and c.user_id = q.buyer_id
), 'acceptance creates a private variant in the intended buyer cart');
select is((select status::text from public.custom_order_quotes where id = '30000000-0000-4000-8000-000000000002'),
  'declined', 'successful quote rejection persists the status');

set local role app_user;
select set_config('app.user_id', '10000000-0000-4000-8000-000000000004', true), set_config('app.role', 'app_user', true);
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000002'), true,
  'admins retain permission to cancel unpaid orders');
select throws_ok($$select public.accept_custom_quote('30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'admin status does not permit accepting a buyer quote');
reset role;

-- Webhooks intentionally have no user subject. They must keep their own permission.
set local role app_service;
select set_config('app.user_id', '', true), set_config('app.role', 'app_service', true);
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000003'), true,
  'the payment webhook can cancel an unpaid order without a user subject');
select is(public.cancel_unpaid_order('20000000-0000-4000-8000-000000000004'), false,
  'the payment webhook cannot cancel a paid order');
select throws_ok($$select public.accept_custom_quote('30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the service role cannot accept quotes on behalf of a buyer');
select throws_ok($$select public.decline_custom_quote('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'the service role cannot decline quotes on behalf of a buyer');
reset role;

-- Defense in depth: even a role with EXECUTE must have a verified user identity.
set local role app_user;
select set_config('app.user_id', '', true), set_config('app.role', 'app_user', true);
select throws_ok($$select public.cancel_unpaid_order('20000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'cancellation rejects a missing user subject');
select throws_ok($$select public.accept_custom_quote('30000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'quote acceptance rejects a missing user subject');
select throws_ok($$select public.decline_custom_quote('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'quote rejection rejects a missing user subject');
reset role;

select * from finish();
rollback;

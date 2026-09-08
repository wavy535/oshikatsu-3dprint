begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('11000000-0000-4000-8000-000000000001', 'checkout-buyer@example.invalid'),
  ('11000000-0000-4000-8000-000000000002', 'checkout-other@example.invalid');
insert into public.orders (id, buyer_id, status, subtotal_amount, total_amount) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'payment_pending', 1000, 1000),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'payment_pending', 1000, 1000);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.begin_order_checkout('21000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous users cannot start payments');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.begin_order_checkout('21000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'another buyer cannot start payments');
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$insert into public.orders (buyer_id, status, subtotal_amount, total_amount)
  values ('11000000-0000-4000-8000-000000000001', 'paid', 1, 1)$$,
  '42501', null, 'buyers cannot fabricate paid orders by direct insert');
select throws_ok($$select public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 1000, 'jpy', true, 'pi_test_1')$$,
  '42501', null, 'buyers cannot apply provider payments');
select is((public.begin_order_checkout('21000000-0000-4000-8000-000000000001')).id,
  '21000000-0000-4000-8000-000000000001'::uuid, 'buyer starts checkout on their order');
select ok((select checkout_started_at is not null from public.orders where id = '21000000-0000-4000-8000-000000000001'),
  'checkout is marked before the external request');
select throws_ok($$select public.cancel_unpaid_order('21000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'buyer cannot bypass provider verification while checkout is active');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 999, 'jpy', true, 'pi_test_1')$$,
  'P0001', null, 'mismatched amounts are rejected');
select throws_ok($$select public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 1000, 'usd', true, 'pi_test_1')$$,
  'P0001', null, 'mismatched currencies are rejected');
select is((select status::text from public.orders where id = '21000000-0000-4000-8000-000000000001'),
  'payment_pending', 'rejected events preserve order status');
select is(public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 1000, 'jpy', true, 'pi_test_1'),
  true, 'valid payment is applied');
select is(public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 1000, 'jpy', true, 'pi_test_1'),
  false, 'replayed payment does not apply twice');
select is((select count(*) from public.order_status_history where order_id = '21000000-0000-4000-8000-000000000001' and status = 'paid'),
  1::bigint, 'only one payment history entry');
select throws_ok($$select public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_another', 1000, 'jpy', true, 'pi_test_1')$$,
  'P0001', null, 'another checkout session is rejected');
select is(public.apply_stripe_checkout('21000000-0000-4000-8000-000000000001', 'cs_test_1', 1000, 'jpy', false),
  false, 'late expiry cannot cancel a paid order');
select is(public.apply_stripe_checkout('21000000-0000-4000-8000-000000000002', 'cs_test_2', 1000, 'jpy', false),
  true, 'provider-confirmed expiry cancels a pending order');
select throws_ok($$select public.apply_stripe_checkout('21000000-0000-4000-8000-000000000002', 'cs_test_2', 1000, 'jpy', true, 'pi_late')$$,
  'P0001', null, 'payment after cancellation is surfaced for reconciliation');
reset role;

select * from finish();
rollback;

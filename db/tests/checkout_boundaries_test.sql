begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to app_guest, app_user, app_service;
set local search_path = public, extensions;
select no_plan();

select ok(not has_function_privilege('app_guest', 'public.place_demo_order(uuid, uuid, text)', 'execute'), 'anonymous users cannot place demo orders');
select ok(not has_function_privilege('app_service', 'public.place_demo_order(uuid, uuid, text)', 'execute'), 'demo checkout requires a user session');
select ok(not has_function_privilege('app_user', 'public.begin_order_checkout(uuid)', 'execute'), 'users cannot start retired Stripe checkout');
select ok(not has_function_privilege('app_service', 'public.apply_stripe_checkout(uuid, text, integer, text, boolean, text)', 'execute'), 'retired Stripe webhook RPC is not exposed');
select ok(not has_function_privilege('app_user', 'public.confirm_order_payment(uuid, text)', 'execute'), 'raw payment confirmation stays internal');
select ok(not has_function_privilege('app_user', 'public.place_order(uuid, text)', 'execute'), 'users cannot bypass atomic demo checkout');
select ok(not has_table_privilege('app_user', 'public.orders', 'insert'), 'users cannot fabricate orders by direct insert');

insert into public.app_users (id, email) values
  ('11000000-0000-4000-8000-000000000001', 'checkout-buyer@example.invalid'),
  ('11000000-0000-4000-8000-000000000002', 'checkout-other@example.invalid');
insert into public.addresses (id, user_id, recipient_name, postal_code, prefecture, city, address_line, phone) values
  ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'テスト', '1000001', '東京都', '千代田区', '1', '00000000000');
insert into public.works (id, creator_id, title, status) values
  ('31000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'デモ注文テスト', 'published');
insert into public.work_variants (id, work_id, size_label, price_jpy, stock, is_listed, bbox_x_mm, bbox_y_mm, bbox_z_mm, est_filament_grams, est_print_hours) values
  ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '10cm', 1000, 5, true, 10, 10, 10, 1, 1);
insert into public.cart_items (cart_id, variant_id, quantity)
select id, '41000000-0000-4000-8000-000000000001', 2
from public.carts where user_id = '11000000-0000-4000-8000-000000000001';
insert into public.orders (id, buyer_id, status, subtotal_amount, total_amount, checkout_started_at) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'payment_pending', 1000, 1000, null),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'payment_pending', 1000, 1000, now());

set local role app_user;
select set_config('app.user_id', '', true), set_config('app.role', 'app_user', true);
select throws_ok($$select public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001')$$, '42501', null, 'a missing subject cannot create orders');
select set_config('app.user_id', '11000000-0000-4000-8000-000000000002', true), set_config('app.role', 'app_user', true);
select throws_ok($$select public.confirm_demo_order('21000000-0000-4000-8000-000000000001')$$, '42501', null, 'another buyer cannot confirm a demo order');
select throws_ok($$select public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001')$$, 'P0001', null, 'another buyer cannot use this address');
select set_config('app.user_id', '11000000-0000-4000-8000-000000000001', true), set_config('app.role', 'app_user', true);
select throws_ok($$select public.confirm_demo_order('21000000-0000-4000-8000-000000000002')$$, 'P0001', null, 'orders with external payment history cannot become demo orders');
select is(public.confirm_demo_order('21000000-0000-4000-8000-000000000001'), true, 'buyer confirms an existing pending order as demo');
select is(public.confirm_demo_order('21000000-0000-4000-8000-000000000001'), false, 'confirming again has no effect');
select ok((select is_demo from public.orders where id = '21000000-0000-4000-8000-000000000001'), 'demo orders are explicitly marked');
reset role;

-- 印刷ジョブ作成時に失敗させ、先行する注文・在庫・カート変更も戻ることを検査。
create function pg_temp.fail_demo_print_job() returns trigger language plpgsql as $$
begin raise exception 'test print job failure'; end;
$$;
create trigger test_demo_failure before insert on public.print_jobs
  for each row execute function pg_temp.fail_demo_print_job();
set local role app_user;
select throws_ok($$select public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001')$$, 'P0001', 'test print job failure', 'downstream failure aborts checkout');
select is((select count(*) from public.orders where checkout_request_id = '61000000-0000-4000-8000-000000000001'), 0::bigint, 'failed checkout leaves no partial order');
select is((select sum(quantity) from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = app.user_id()), 2::bigint, 'failed checkout preserves cart');
select is((select stock from public.work_variants where id = '41000000-0000-4000-8000-000000000001'), 5, 'failed checkout preserves stock');
reset role;
drop trigger test_demo_failure on public.print_jobs;

set local role app_user;
select lives_ok($$select public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001')$$, 'buyer creates and confirms demo order atomically');
select is(public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'),
  (select id from public.orders where checkout_request_id = '61000000-0000-4000-8000-000000000001'), 'replay returns the same order even with an empty cart');
select is((select count(*) from public.orders where checkout_request_id = '61000000-0000-4000-8000-000000000001'), 1::bigint, 'replay cannot duplicate orders');
select is((select stock from public.work_variants where id = '41000000-0000-4000-8000-000000000001'), 3, 'stock decremented only once');
select is((select count(*) from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = app.user_id()), 0::bigint, 'successful checkout clears cart');
select ok((select is_demo and status <> 'payment_pending' from public.orders where checkout_request_id = '61000000-0000-4000-8000-000000000001'), 'successful checkout is confirmed and marked demo');
select throws_ok($$select public.place_demo_order('51000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002')$$, 'P0001', 'カートが空です', 'a new request cannot order an already-consumed cart');
reset role;
select ok((select count(*) > 0 from public.print_jobs pj join public.order_items oi on oi.id = pj.order_item_id join public.orders o on o.id = oi.order_id where o.checkout_request_id = '61000000-0000-4000-8000-000000000001'), 'successful checkout creates print jobs');

select * from finish();
rollback;

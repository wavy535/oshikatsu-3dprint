begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('14000000-0000-4000-8000-000000000001', 'allocation-buyer@example.invalid'),
  ('14000000-0000-4000-8000-000000000002', 'allocation-creator-1@example.invalid'),
  ('14000000-0000-4000-8000-000000000003', 'allocation-creator-2@example.invalid'),
  ('14000000-0000-4000-8000-000000000004', 'allocation-other@example.invalid');
update public.profiles set role = 'creator' where id in
  ('14000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000003');
insert into public.works (id, creator_id, title, status) values
  ('34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002', 'allocation 1', 'draft'),
  ('34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000003', 'allocation 2', 'draft');
insert into public.orders (id, buyer_id, status, subtotal_amount, total_amount, platform_fee_rate) values
  ('24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', 'paid', 126, 126, 0.2),
  ('24000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000001', 'paid', 5, 5, 0.4);
insert into public.order_items
  (id, order_id, work_id, creator_id, unit_price, quantity, creator_payout_amount, platform_fee_amount, print_cost_amount,
   stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot)
values
  ('44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002', 63, 1, 50, 13, 0, '', 'PLA', 'white'),
  ('44000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000003', 63, 1, 50, 13, 0, '', 'PLA', 'white');
insert into public.order_items
  (id, order_id, work_id, creator_id, unit_price, quantity, creator_payout_amount, platform_fee_amount, print_cost_amount,
   stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot)
select ('44000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '24000000-0000-4000-8000-000000000002', '34000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000002', 1, 1, 1, 0, 0, '', 'PLA', 'white'
from generate_series(3, 7) n;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select sum(payout_amount) from public.creator_item_settlements where order_id = '24000000-0000-4000-8000-000000000001'),
  101::bigint, 'item payouts add up to the order payout');
select is((select sum(fee_amount) from public.creator_item_settlements where order_id = '24000000-0000-4000-8000-000000000001'),
  25::bigint, 'item fees add up to the order fee');
select is((select payout_amount from public.creator_item_settlements where item_id = '44000000-0000-4000-8000-000000000001'),
  51, 'first equal share receives 51');
select is((select payout_amount from public.creator_item_settlements where item_id = '44000000-0000-4000-8000-000000000002'),
  50, 'second equal share receives 50');
select is((select sum(payout_amount) from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000002')),
  3::bigint, 'five small shares preserve the total');
select ok((select min(payout_amount) >= 0 from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000002')),
  'rounding cannot create a negative remainder in a profitable order');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"14000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000001')),
  1::bigint, 'creator only sees their allocation');
select is((select payout_amount from public.creator_item_settlements where item_id = '44000000-0000-4000-8000-000000000002'),
  50, 'RLS does not change the second creator share');
select is((select pending_payout from public.creator_payout_balances where creator_id = '14000000-0000-4000-8000-000000000003'),
  50, 'creator balance uses the same allocation');
select set_config('request.jwt.claims', '{"sub":"14000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000001')),
  0::bigint, 'unrelated users cannot read allocations');
select set_config('request.jwt.claims', '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000001')),
  2::bigint, 'buyer sees both allocations');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous callers cannot invoke allocation RPC');
reset role;

update public.orders set print_cost_amount = 8 where id = '24000000-0000-4000-8000-000000000002';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select sum(payout_amount) from public.order_item_settlement_amounts('24000000-0000-4000-8000-000000000002')),
  (-3)::bigint, 'negative settlements also preserve the total');
reset role;

select * from finish();
rollback;

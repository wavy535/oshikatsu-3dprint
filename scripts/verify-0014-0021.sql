\set ON_ERROR_STOP on
begin;

-- =============================================================================
-- 0014〜0021 の動作確認（開発シードが入った DB に対して流す。最後に rollback）
--
--   docker exec -i supabase_db_osinest psql -U postgres -d postgres < scripts/verify-0014-0021.sql
--
-- 見るもの:
--   1. 決済: place_order → confirm_order_payment で注文・明細・ジョブ・在庫・カートが動く
--   2. 精算: order_settlements の式（差引 × 料率、確定／見込み）
--   3. 受取残高: 確定受取 − 再印刷負担 − 申請、申請の下限・上限のトリガー
--   4. 検品NG（モデル側）→ 修正依頼 → 出品停止、クリエイターが検品記録を読める
--   5. オーダーメイド: 見積り承認で専用サイズがカートに入り、本人だけ買える
--   6. 通知の行き先が実装済みの画面を指している
-- =============================================================================

\echo ''
\echo '=== 1. 決済: カート → 注文 → 支払い確定 ==='
-- 買う人としてふるまう
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- カートに 1 件入れる（ふわもこ台座 10cm）
insert into public.cart_items (cart_id, variant_id, quantity)
select c.id, v.id, 2
  from public.carts c, public.work_variants v join public.works w on w.id = v.work_id
 where c.user_id = '11111111-1111-1111-1111-111111111111'
   and w.title = 'ふわもこ台座（丸型）' and v.size_label = '10cm'
on conflict (cart_id, variant_id) do update set quantity = 2;

select public.place_order((select id from public.addresses where user_id = '11111111-1111-1111-1111-111111111111' limit 1), '検証') as order_id \gset

select status, subtotal_amount, print_cost_amount, shipping_fee_amount, total_amount,
       total_amount = subtotal_amount + print_cost_amount + shipping_fee_amount as total_ok,
       platform_fee_rate
  from public.orders where id = :'order_id';

-- 支払い確定はサーバー（service role）が呼ぶ
reset role;
select public.confirm_order_payment(:'order_id', 'verify') as confirmed;
select o.status, count(j.id) as jobs, min(j.status)::text as job_status,
       (select count(*) from public.cart_items ci join public.carts c on c.id = ci.cart_id
         where c.user_id = o.buyer_id) as cart_left
  from public.orders o left join public.print_jobs j on j.order_id = o.id
 where o.id = :'order_id' group by o.id, o.status, o.buyer_id;

\echo ''
\echo '=== 2. 精算: 見込み → 実費で確定 ==='
select is_final, print_cost_used = print_fee_amount as uses_fee_estimate,
       pool_amount = gross_amount - print_cost_used - shipping_used as pool_ok,
       fee_amount = greatest(round(pool_amount * platform_fee_rate), 0) as fee_ok
  from public.order_settlements where order_id = :'order_id';

-- 実績を入れて発送すると確定する
update public.print_jobs set status = 'printing' where order_id = :'order_id';
update public.print_jobs set status = 'printed', actual_filament_grams = 100, actual_print_hours = 4 where order_id = :'order_id';
insert into public.qc_inspections (print_job_id, inspector_id, result)
select id, '44444444-4444-4444-4444-444444444444', 'passed' from public.print_jobs where order_id = :'order_id';
insert into public.shipments (order_id, carrier, tracking_number, shipping_fee_jpy, packer_id)
values (:'order_id', 'yamato', 'VERIFY-1', 600, '44444444-4444-4444-4444-444444444444');

select is_final, print_actual_amount, shipping_actual_amount, pool_amount, fee_amount, payout_amount,
       (select status from public.orders where id = :'order_id') as order_status
  from public.order_settlements where order_id = :'order_id';

\echo ''
\echo '=== 3. 受取残高と申請の検査 ==='
select settled_payout, pending_payout, reprint_charges, requested_amount, available_amount,
       available_amount = settled_payout - reprint_charges - requested_amount - paid_amount as formula_ok
  from public.creator_payout_balances where creator_id = '22222222-2222-2222-2222-222222222222';

-- 残高を超える申請は止まる
do $$
begin
  insert into public.payout_requests (creator_id, amount) values ('22222222-2222-2222-2222-222222222222', 99999999);
  raise exception '残高超過の申請が通ってしまった';
exception when others then
  if sqlerrm like '%受取可能額%' or sqlerrm like '%口座%' then
    raise notice 'OK: 申請が止まった → %', sqlerrm;
  else
    raise;
  end if;
end $$;

\echo ''
\echo '=== 4. 検品NG（モデル側）→ 修正依頼 → 出品停止 ==='
select j.id as job_id from public.print_jobs j join public.print_queue q on q.id = j.id
 where q.status = 'printed' limit 1 \gset
insert into public.qc_inspections (print_job_id, inspector_id, result, memo, reprint_cause)
values (:'job_id', '44444444-4444-4444-4444-444444444444', 'failed', '検証: はめ合い不良', 'model');

select r.revision_no, r.status, r.charged_to_creator, r.reprint_fee_jpy > 0 as fee_set, v.is_listed
  from public.revision_requests r join public.work_variants v on v.id = r.variant_id
 where r.print_job_id = :'job_id';

-- クリエイターが検品記録を読める（0018）
select set_config('request.jwt.claims', '{"sub":"' || (select creator_id::text from public.revision_requests where print_job_id = :'job_id') || '","role":"authenticated"}', true);
set local role authenticated;
select count(*) as inspections_visible_to_creator from public.qc_inspections where print_job_id = :'job_id';
reset role;

\echo ''
\echo '=== 5. オーダーメイド: 見積り承認 → 専用サイズがカートに入る ==='
insert into public.custom_order_requests (id, requester_id, creator_id, message)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '検証用の相談');
insert into public.custom_order_quotes (id, request_id, creator_id, buyer_id, status, price_jpy, print_fee_jpy, shipping_fee_jpy, est_filament_grams, est_print_hours, part_count)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'sent', 3000, 500, 520, 80, 4, 2);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.accept_custom_quote('eeeeeeee-0000-0000-0000-000000000001') as variant_id \gset
select q.status, v.is_listed, v.stock, public.variant_reserved_for(v.id, '11111111-1111-1111-1111-111111111111') as reserved_for_buyer,
       exists (select 1 from public.cart_items ci join public.carts c on c.id = ci.cart_id
               where c.user_id = '11111111-1111-1111-1111-111111111111' and ci.variant_id = v.id) as in_cart
  from public.custom_order_quotes q join public.work_variants v on v.id = q.variant_id
 where q.id = 'eeeeeeee-0000-0000-0000-000000000001';
-- 他人には予約されていない
select public.variant_reserved_for(:'variant_id', '33333333-3333-3333-3333-333333333333') as reserved_for_other;
reset role;

\echo ''
\echo '=== 6. 通知の行き先が実装済みの画面を指す ==='
select link_path, count(*)
  from public.notifications
 where link_path !~ '^/(mypage/(orders|messages|custom-orders|nuis|notifications)|studio(/|$)|works/|creators/)'
 group by link_path;
\echo '（上の表が空なら OK）'

rollback;

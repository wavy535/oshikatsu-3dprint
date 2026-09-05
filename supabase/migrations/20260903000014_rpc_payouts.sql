-- ============================================================
-- 0014: 精算(payouts) まわり RPC
-- DESIGN.md §4.4.7 / §6.3.I / §8.6 準拠。
--
-- payout_accounts.account_number_enc は pgcrypto の pgp_sym_encrypt/decrypt
-- で暗号化する。鍵はDBに保存せず、呼び出しのたびにアプリ層
-- （環境変数 PAYOUT_ACCOUNT_ENCRYPTION_KEY）から渡す。
-- ============================================================

-- ─────────────────────────────────────────────
-- upsert_payout_account : クリエイター本人の口座登録・更新
--   payout_accounts は本人のみ RLS で all 許可されているが、
--   account_number は暗号化してから保存する必要があるため
--   pgp_sym_encrypt を呼べる SECURITY DEFINER 関数を経由する。
-- ─────────────────────────────────────────────
create or replace function public.upsert_payout_account(
  p_bank_name text,
  p_bank_code text,
  p_branch_name text,
  p_branch_code text,
  p_account_type text,
  p_account_number text,
  p_account_holder_kana text,
  p_key text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception '権限がありません';
  end if;

  insert into public.payout_accounts (
    user_id, bank_name, bank_code, branch_name, branch_code,
    account_type, account_number_enc, account_holder_kana
  ) values (
    auth.uid(), p_bank_name, p_bank_code, p_branch_name, p_branch_code,
    p_account_type, pgp_sym_encrypt(p_account_number, p_key), p_account_holder_kana
  )
  on conflict (user_id) do update set
    bank_name = excluded.bank_name,
    bank_code = excluded.bank_code,
    branch_name = excluded.branch_name,
    branch_code = excluded.branch_code,
    account_type = excluded.account_type,
    account_number_enc = excluded.account_number_enc,
    account_holder_kana = excluded.account_holder_kana,
    updated_at = now();
end;
$$;

-- ─────────────────────────────────────────────
-- close_payouts : 月次締め（cron専用、service_role のみ）
--   対象: orders.status='completed' かつ completed_at <= p_period_end、
--         order_items.item_status <> 'cancelled'、
--         まだ payout_items に収載されていない明細。
--   3,000円未満(p_min_amount)は payout を作らず翌月に自動繰越
--   （「未収載」条件で対象に含め続けるだけで自然に実現される）。
-- ─────────────────────────────────────────────
create or replace function public.close_payouts(
  p_period_start date,
  p_period_end date,
  p_transfer_fee integer,
  p_min_amount integer
) returns table(creator_id uuid, net_amount integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator record;
  v_gross integer;
  v_creator_revenue integer;
  v_commission integer;
  v_net integer;
  v_payout_id uuid;
begin
  if auth.uid() is not null then
    raise exception '権限がありません';
  end if;

  for v_creator in
    select distinct oi.creator_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'completed'
      and o.completed_at <= (p_period_end + 1)::timestamptz
      and oi.item_status <> 'cancelled'
      and not exists (select 1 from public.payout_items pi where pi.order_item_id = oi.id)
  loop
    select coalesce(sum(oi.line_total), 0), coalesce(sum(oi.creator_revenue), 0)
      into v_gross, v_creator_revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'completed'
      and o.completed_at <= (p_period_end + 1)::timestamptz
      and oi.item_status <> 'cancelled'
      and oi.creator_id = v_creator.creator_id
      and not exists (select 1 from public.payout_items pi where pi.order_item_id = oi.id);

    v_commission := v_gross - v_creator_revenue;
    v_net := v_creator_revenue - p_transfer_fee;

    if v_net < p_min_amount then
      creator_id := v_creator.creator_id;
      net_amount := v_net;
      status := 'rolled_over';
      return next;
      continue;
    end if;

    insert into public.payouts (
      creator_id, period_start, period_end,
      gross_amount, commission, transfer_fee, net_amount,
      status, scheduled_date
    ) values (
      v_creator.creator_id, p_period_start, p_period_end,
      v_gross, v_commission, p_transfer_fee, v_net,
      'unpaid', p_period_end + 5
    )
    returning id into v_payout_id;

    insert into public.payout_items (payout_id, order_item_id, amount)
    select v_payout_id, oi.id, oi.creator_revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'completed'
      and o.completed_at <= (p_period_end + 1)::timestamptz
      and oi.item_status <> 'cancelled'
      and oi.creator_id = v_creator.creator_id
      and not exists (select 1 from public.payout_items pi where pi.order_item_id = oi.id);

    creator_id := v_creator.creator_id;
    net_amount := v_net;
    status := 'created';
    return next;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────
-- admin_mark_payout_paid : 払込完了マーク（unpaid/scheduled → paid）
-- ─────────────────────────────────────────────
create or replace function public.admin_mark_payout_paid(
  p_payout_id uuid,
  p_transaction_ref text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '権限がありません';
  end if;

  update public.payouts
  set status = 'paid',
      paid_at = now(),
      paid_by = auth.uid(),
      transaction_ref = p_transaction_ref
  where id = p_payout_id
    and status in ('unpaid', 'scheduled');

  if not found then
    raise exception '未払いの払込のみ完了にできます';
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- admin_export_payout_accounts : 振込CSV出力用に口座を復号する。
--   ここでのみ account_number を復号し、呼び出しのたびに
--   payout_export_logs へ記録する（DESIGN.md §8.3/§8.6）。
-- ─────────────────────────────────────────────
create or replace function public.admin_export_payout_accounts(
  p_payout_ids uuid[],
  p_key text
) returns table(
  payout_id uuid,
  creator_id uuid,
  net_amount integer,
  bank_name text,
  bank_code text,
  branch_name text,
  branch_code text,
  account_type text,
  account_number text,
  account_holder_kana text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row_count integer;
begin
  if not public.is_admin() then
    raise exception '権限がありません';
  end if;

  return query
    select
      p.id, p.creator_id, p.net_amount,
      pa.bank_name, pa.bank_code, pa.branch_name, pa.branch_code, pa.account_type,
      pgp_sym_decrypt(pa.account_number_enc, p_key),
      pa.account_holder_kana
    from public.payouts p
    join public.payout_accounts pa on pa.user_id = p.creator_id
    where p.id = any(p_payout_ids);

  get diagnostics v_row_count = row_count;

  insert into public.payout_export_logs (exported_by, payout_ids, row_count)
  values (auth.uid(), p_payout_ids, v_row_count);
end;
$$;

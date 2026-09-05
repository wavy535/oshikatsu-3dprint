-- ============================================================
-- 0006: 精算（payouts）系テーブル
-- DESIGN.md §4.4.7 準拠
-- ============================================================

create table public.payouts (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.profiles(id) on delete restrict,
  period_start   date not null,
  period_end     date not null,
  gross_amount   integer not null check (gross_amount >= 0),
  commission     integer not null check (commission >= 0),
  transfer_fee   integer not null default 0 check (transfer_fee >= 0),
  net_amount     integer not null check (net_amount >= 0),
  status         payout_status not null default 'unpaid',
  scheduled_date date,
  paid_at        timestamptz,
  paid_by        uuid references public.profiles(id),
  transaction_ref text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (creator_id, period_start, period_end),
  constraint payouts_net_matches
    check (net_amount = gross_amount - commission - transfer_fee),
  constraint payouts_period_order check (period_start <= period_end)
);
create index on public.payouts (creator_id, period_start desc);
create index on public.payouts (status, scheduled_date);
create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

create table public.payout_items (
  id            uuid primary key default gen_random_uuid(),
  payout_id     uuid not null references public.payouts(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  amount        integer not null check (amount >= 0),
  created_at    timestamptz not null default now()
);
create index on public.payout_items (payout_id);

-- ============================================================
-- 0001: extensions, enums,共通トリガ関数
-- DESIGN.md §4.2 / §4.3 準拠
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create type user_role        as enum ('user', 'admin');
create type creator_status   as enum ('pending', 'approved', 'suspended');
create type product_status   as enum ('draft', 'in_review', 'published', 'rejected', 'archived');
create type order_status     as enum ('pending_payment', 'paid', 'printing', 'shipped', 'completed', 'cancelled', 'refunded');
create type item_status      as enum ('pending', 'printing', 'printed', 'shipped', 'cancelled');
create type payout_status    as enum ('unpaid', 'scheduled', 'paid', 'failed');
create type thread_kind      as enum ('pre_purchase', 'order');
create type filament_finish  as enum ('matte', 'glossy', 'silk', 'glitter', 'transparent');

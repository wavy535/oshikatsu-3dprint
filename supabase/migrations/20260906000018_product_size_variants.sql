-- ============================================================
-- 0018: サイズ展開（product_size_variants）
--
-- Figma「推し活2」の再編で、作品は 10/15/20cm のサイズごとに
-- 「販売価格・在庫・印刷代行費」を持つモデルに変わった。
-- 既存の products.base_price（単一価格）は廃止せず、
-- 「取扱いのあるサイズの最安値」を保持する派生列として残す。
-- こうすると search_products の価格フィルタ／並び替え、既存の
-- カート・注文まわりが従来どおり動く。
-- ============================================================

create table public.product_size_variants (
  product_id    uuid     not null references public.products(id) on delete cascade,
  nui_size_id   smallint not null references public.nui_sizes(id),

  -- クリエイターが決める販売価格。products.base_price と同じ範囲に揃える
  price         integer  not null check (price between 100 and 500000),
  -- 在庫（残り点数）。0 なら売り切れで、購入導線では選べない
  stock         integer  not null default 0 check (stock >= 0),
  -- 印刷代行費。STEP1 の自動検証でサイズごとに算出される運営側の取り分
  agency_fee    integer  not null default 0 check (agency_fee >= 0),

  est_weight_g  integer check (est_weight_g > 0),
  est_print_min integer check (est_print_min > 0),

  -- 取扱いの有無。造形サイズ上限を超えるなどで出品できないサイズは false
  is_active     boolean  not null default true,
  unavailable_reason text check (char_length(unavailable_reason) <= 200),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (product_id, nui_size_id)
);
create index on public.product_size_variants (nui_size_id);
create trigger product_size_variants_set_updated_at
  before update on public.product_size_variants
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- products.base_price と product_nui_sizes をサイズ展開から導出する
--   base_price        … 取扱いのあるサイズの最安値
--   product_nui_sizes … 検索の「対応ぬいサイズ」絞り込み用の集合
-- どちらも手で二重管理すると必ずずれるので、変異のたびに引き直す。
-- ────────────────────────────────────────────────────────────
create or replace function public.sync_product_from_size_variants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid := coalesce(new.product_id, old.product_id);
  v_min_price  integer;
begin
  select min(price) into v_min_price
  from public.product_size_variants
  where product_id = v_product_id and is_active and stock >= 0;

  -- サイズ展開を全部消した場合は base_price をそのまま残す（0 にしない）
  if v_min_price is not null then
    update public.products
      set base_price = v_min_price
      where id = v_product_id and base_price is distinct from v_min_price;
  end if;

  delete from public.product_nui_sizes pns
  where pns.product_id = v_product_id
    and not exists (
      select 1 from public.product_size_variants v
      where v.product_id = v_product_id
        and v.nui_size_id = pns.nui_size_id
        and v.is_active
    );

  insert into public.product_nui_sizes (product_id, nui_size_id)
  select v_product_id, v.nui_size_id
  from public.product_size_variants v
  where v.product_id = v_product_id and v.is_active
  on conflict do nothing;

  return null;
end $$;

create trigger product_size_variants_sync
  after insert or update or delete on public.product_size_variants
  for each row execute function public.sync_product_from_size_variants();

-- ────────────────────────────────────────────────────────────
-- RLS: 公開作品なら誰でも読める。書けるのは作品の持ち主と admin。
-- （product_nui_sizes と同じ形に揃えてある）
-- ────────────────────────────────────────────────────────────
alter table public.product_size_variants enable row level security;

create policy product_size_variants_select on public.product_size_variants
  for select using (
    exists (select 1 from public.products p
            where p.id = product_id
              and (p.status = 'published' or p.creator_id = auth.uid() or public.is_admin()))
  );
create policy product_size_variants_write_owner on public.product_size_variants
  for all using (public.owns_product(product_id) or public.is_admin())
       with check (public.owns_product(product_id) or public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 既存作品の移行: いま product_nui_sizes に入っているサイズを
-- 「base_price・在庫なし」のサイズ展開として作り直す。
-- 在庫は 0 のままだと買えなくなるので、旧モデルの挙動（在庫無制限）に
-- 近い既定値として 10 を入れておく。
-- ────────────────────────────────────────────────────────────
insert into public.product_size_variants (product_id, nui_size_id, price, stock, agency_fee, est_weight_g, est_print_min)
select
  pns.product_id,
  pns.nui_size_id,
  p.base_price,
  10,
  0,
  p.est_weight_g,
  p.est_print_min
from public.product_nui_sizes pns
join public.products p on p.id = pns.product_id
on conflict do nothing;

-- ────────────────────────────────────────────────────────────
-- 価格の解決: (作品, サイズ) の販売価格。サイズ展開が無ければ base_price。
-- カート・注文・表示で同じ答えを返させるため 1 箇所にまとめる。
-- ────────────────────────────────────────────────────────────
create or replace function public.resolve_unit_price(
  p_product_id uuid,
  p_nui_size_id smallint
) returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select v.price from public.product_size_variants v
      where v.product_id = p_product_id
        and v.nui_size_id = p_nui_size_id
        and v.is_active),
    (select p.base_price from public.products p where p.id = p_product_id)
  );
$$;

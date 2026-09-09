-- Current business schema, PostgreSQL 17. Changes after this baseline use new migrations.
--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TYPE public.creator_application_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE public.custom_request_status AS ENUM (
    'pending',
    'responded',
    'accepted',
    'declined'
);

CREATE TYPE public.filament_material AS ENUM (
    'PLA',
    'PETG',
    'ABS',
    'TPU'
);

CREATE TYPE public.fit_verdict AS ENUM (
    'too_small',
    'tight',
    'good',
    'loose',
    'unknown'
);

CREATE TYPE public.issue_severity AS ENUM (
    'ok',
    'warning',
    'error'
);

CREATE TYPE public.model_file_format AS ENUM (
    '3mf',
    'stl'
);

CREATE TYPE public.notification_digest AS ENUM (
    'instant',
    'daily'
);

CREATE TYPE public.notification_kind AS ENUM (
    'order_shipping',
    'favorite_price',
    'message',
    'review',
    'creator',
    'announcement'
);

COMMENT ON TYPE public.notification_kind IS '通知の種類。通知設定のマトリクスの行と1対1で対応する。';

CREATE TYPE public.nui_kind AS ENUM (
    'plush',
    'acrylic_stand',
    'figure',
    'other'
);

CREATE TYPE public.order_status AS ENUM (
    'payment_pending',
    'paid',
    'printing_queued',
    'printing',
    'packaging',
    'shipped',
    'completed',
    'cancelled',
    'refunded'
);

CREATE TYPE public.payout_status AS ENUM (
    'requested',
    'processing',
    'paid',
    'rejected'
);

CREATE TYPE public.print_fee_billing AS ENUM (
    'bundled',
    'separate'
);

CREATE TYPE public.print_job_status AS ENUM (
    'queued',
    'printing',
    'printed',
    'qc_passed',
    'qc_failed',
    'reprinting',
    'cancelled'
);

CREATE TYPE public.print_orientation AS ENUM (
    'flat',
    'upright',
    'tilted',
    'as_is'
);

CREATE TYPE public.qc_result AS ENUM (
    'passed',
    'failed'
);

CREATE TYPE public.quote_status AS ENUM (
    'draft',
    'sent',
    'accepted',
    'ordered',
    'revision',
    'declined',
    'expired'
);

CREATE TYPE public.reprint_cause AS ENUM (
    'model',
    'print',
    'material',
    'handling'
);

CREATE TYPE public.revision_resolution AS ENUM (
    'reupload',
    'instruction',
    'unlist',
    'no_action'
);

CREATE TYPE public.revision_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'disputed',
    'cancelled'
);

CREATE TYPE public.scan_status AS ENUM (
    'capturing',
    'generating',
    'ready',
    'failed'
);

CREATE TYPE public.shipping_carrier AS ENUM (
    'yamato',
    'sagawa',
    'japanpost',
    'other'
);

CREATE TYPE public.support_mode AS ENUM (
    'none',
    'auto',
    'custom'
);

CREATE TYPE public.tag_type AS ENUM (
    'category',
    'nui_size',
    'worldview'
);

CREATE TYPE public.user_role AS ENUM (
    'buyer',
    'creator',
    'admin'
);

CREATE TYPE public.validation_status AS ENUM (
    'pending',
    'passed',
    'warning',
    'failed'
);

CREATE TYPE public.work_status AS ENUM (
    'draft',
    'published',
    'archived'
);

CREATE FUNCTION public.accept_custom_quote(p_quote_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  q public.custom_order_quotes;
  v_user uuid := app.user_id();
  v_id uuid;
  w_id uuid;
begin
  if v_user is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then raise exception '見積りが見つかりません'; end if;
  if q.buyer_id is distinct from v_user then
    raise exception 'この見積りを承認できるのは依頼した本人だけです' using errcode = '42501';
  end if;
  if q.status <> 'sent' then raise exception '提示中の見積りではありません（%）', q.status; end if;
  if q.expires_at < now() then
    update public.custom_order_quotes set status = 'expired' where id = p_quote_id;
    raise exception 'この見積りは有効期限を過ぎています';
  end if;

  -- 専用作品・サイズ・カートの作成は既存のトランザクション内で完結させる。
  w_id := q.base_work_id;
  if w_id is null then
    insert into public.works (creator_id, title, description, status)
    values (q.creator_id, 'オーダーメイド ' || q.quote_no, coalesce(q.note, ''), 'draft')
    returning id into w_id;
  end if;

  insert into public.work_variants (
    work_id, size_label, scale_ratio, asset_id,
    max_part_bbox_x_mm, max_part_bbox_y_mm, max_part_bbox_z_mm,
    est_filament_grams, est_print_hours, part_count,
    price_jpy, stock, is_listed
  ) values (
    w_id, 'オーダーメイド ' || q.quote_no, 1.0, q.asset_id,
    q.max_part_bbox_x_mm, q.max_part_bbox_y_mm, q.max_part_bbox_z_mm,
    q.est_filament_grams, q.est_print_hours, q.part_count,
    q.price_jpy, 1, false
  ) returning id into v_id;

  update public.custom_order_quotes
     set status = 'accepted', variant_id = v_id, accepted_at = now(), updated_at = now()
   where id = p_quote_id;

  update public.custom_order_requests set status = 'accepted' where id = q.request_id;

  insert into public.cart_items (cart_id, variant_id, quantity)
  select c.id, v_id, 1 from public.carts c where c.user_id = q.buyer_id
  on conflict (cart_id, variant_id) do nothing;

  return v_id;
end;
$$;

COMMENT ON FUNCTION public.accept_custom_quote(p_quote_id uuid) IS '見積りを承認し、購入者専用の work_variant を作って id を返す。以降は通常のカート・決済に乗る。';

CREATE FUNCTION public.apply_filament_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update public.filaments
     set stock_grams = greatest(stock_grams + round(new.delta_grams)::integer, 0)
   where id = new.filament_id;
  return null;
end;
$$;

CREATE FUNCTION public.apply_qc_result() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.result = 'passed' then
    update public.print_jobs set status = 'qc_passed' where id = new.print_job_id;
  else
    update public.print_jobs
       set status = 'qc_failed',
           failure_count = failure_count + 1
     where id = new.print_job_id;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.apply_revision_listing() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.variant_id is null then return null; end if;

  if new.status = 'open' or new.status = 'in_progress' then
    update public.work_variants set is_listed = false where id = new.variant_id;
  elsif new.status = 'resolved' and new.resolution <> 'unlist' then
    -- 自動では再公開しない。クリエイターが内容を確認して自分で戻す。
    null;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.apply_scan_ready() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') then
    if new.nui_id is not null then
      update public.nui_profiles set has_scan = true, updated_at = now() where id = new.nui_id;
      select name into v_name from public.nui_profiles where id = new.nui_id;
    end if;
    update public.nui_scans set completed_at = coalesce(completed_at, now()) where id = new.id;

    perform public.push_notification(
      new.user_id, 'announcement',
      coalesce(v_name, 'ぬい') || ' の3Dモデルができました',
      '作品ページで「うちの子で見る」が使えるようになりました',
      '/my-nui/' || coalesce(new.nui_id::text, ''),
      'nui_scans', new.id);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.apply_shipment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.orders
     set status = 'shipped',
         tracking_number = new.tracking_number,
         shipped_at = new.shipped_at,
         updated_at = now()
   where id = new.order_id;
  return null;
end;
$$;

CREATE FUNCTION public.apply_stripe_checkout(p_order_id uuid, p_session_id text, p_amount_total integer, p_currency text, p_paid boolean, p_payment_ref text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception '注文が見つかりません'; end if;
  if p_session_id is null or p_session_id = '' or p_paid is null
     or p_currency is distinct from 'jpy' or p_amount_total is distinct from o.total_amount then
    raise exception '決済の金額・通貨・Sessionが注文と一致しません';
  end if;
  if o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id <> p_session_id then
    raise exception '別の決済Sessionが指定されました';
  end if;
  if p_paid and (p_payment_ref is null or p_payment_ref = '') then
    raise exception '支払い参照がありません';
  end if;
  if p_paid and o.status <> 'payment_pending' then
    if o.stripe_payment_intent_id = p_payment_ref then return false; end if;
    raise exception 'この注文には支払いを反映できません';
  end if;
  update public.orders
    set stripe_checkout_session_id = p_session_id,
        checkout_started_at = coalesce(checkout_started_at, now())
    where id = o.id;
  if p_paid then
    return public.confirm_order_payment(o.id, p_payment_ref);
  end if;
  return public.cancel_unpaid_order(o.id);
end;
$$;

CREATE FUNCTION public.assign_print_job_no() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.job_no is null or new.job_no = '' then
    new.job_no := 'J-' || nextval('public.print_job_no_seq')::text;
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.assign_quote_no() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.quote_no is null or new.quote_no = '' then
    new.quote_no := 'CR-' || nextval('public.quote_no_seq')::text;
  end if;

  -- 代行費は見積り作成者が手で入れるのではなく、材料量と造形時間から計算する。
  -- 手入力を許すと、画面に出る内訳と実際の請求額が食い違う。
  if new.est_filament_grams is not null and new.est_print_hours is not null then
    new.print_fee_jpy := public.calc_print_fee(
      new.est_filament_grams, new.est_print_hours, new.part_count);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

CREATE FUNCTION public.assign_revision_no() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.revision_no is null or new.revision_no = '' then
    new.revision_no := 'RV-' || nextval('public.revision_no_seq')::text;
  end if;
  new.charged_to_creator := (new.cause = 'model');
  new.updated_at := now();
  return new;
end;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    status public.order_status DEFAULT 'payment_pending'::public.order_status NOT NULL,
    subtotal_amount integer NOT NULL,
    platform_fee_amount integer DEFAULT 0 NOT NULL,
    print_cost_amount integer DEFAULT 0 NOT NULL,
    total_amount integer NOT NULL,
    shipping_address_id uuid,
    stripe_payment_intent_id text,
    tracking_number text,
    shipped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ship_due_at timestamp with time zone,
    gift_wrapping boolean DEFAULT false NOT NULL,
    shipping_fee_amount integer DEFAULT 0 NOT NULL,
    platform_fee_rate numeric(4,3),
    checkout_started_at timestamp with time zone,
    stripe_checkout_session_id text,
    is_demo boolean DEFAULT false NOT NULL,
    checkout_request_id uuid,
    CONSTRAINT orders_platform_fee_rate_check CHECK (((platform_fee_rate >= (0)::numeric) AND (platform_fee_rate < (1)::numeric))),
    CONSTRAINT orders_shipping_fee_amount_check CHECK ((shipping_fee_amount >= 0))
);

COMMENT ON COLUMN public.orders.total_amount IS '購入者の支払い合計 = subtotal_amount（作品代金）+ print_cost_amount（印刷代行費）+ shipping_fee_amount（送料）。';

COMMENT ON COLUMN public.orders.ship_due_at IS '出荷期限。印刷キューの並び順と遅延アラートの基準。';

COMMENT ON COLUMN public.orders.shipping_fee_amount IS '購入者が払った送料。決済時に確定する。運営の実費は shipments.shipping_fee_jpy。';

COMMENT ON COLUMN public.orders.platform_fee_rate IS '注文時の運営手数料率。print_pricing_rules から写す（トリガー）。精算はこの率で行う。';

CREATE FUNCTION public.begin_order_checkout(p_order_id uuid) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if app.user_id() is null or not found or o.buyer_id is distinct from app.user_id() then
    raise exception using errcode = '42501', message = 'この注文を操作できません';
  end if;
  if o.status <> 'payment_pending' then
    raise exception '支払い待ちの注文ではありません';
  end if;
  update public.orders set checkout_started_at = coalesce(checkout_started_at, now())
    where id = o.id returning * into o;
  return o;
end;
$$;

CREATE FUNCTION public.calc_print_fee(grams numeric, hours numeric, parts integer) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
declare
  r public.print_pricing_rules;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な print_pricing_rules がありません';
  end if;
  return round(coalesce(grams, 0) * r.material_yen_per_gram)
       + round(coalesce(hours, 0) * r.machine_yen_per_hour)
       + r.handling_base_yen
       + r.handling_per_part_yen * greatest(coalesce(parts, 1), 1);
end;
$$;

CREATE FUNCTION public.cancel_unpaid_order(p_order_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  o public.orders;
  is_service boolean := coalesce(app.current_role() = 'app_service', false);
begin
  if not is_service and app.user_id() is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if not is_service and o.buyer_id is distinct from app.user_id() and not public.is_admin() then
    raise exception using errcode = '42501', message = 'この注文を取り消す権限がありません';
  end if;
  if o.status <> 'payment_pending' then return false; end if;
  -- Session作成中も含む。サーバーでStripe側の失効・失敗を確認してから取り消す。
  if o.checkout_started_at is not null and not is_service then
    raise exception using errcode = '42501', message = '決済状況を確認してから取り消してください';
  end if;
  update public.orders set status = 'cancelled', updated_at = now() where id = o.id;
  insert into public.order_status_history (order_id, status, note, changed_by)
    values (o.id, 'cancelled', '未払い注文の取消', coalesce(app.user_id(), o.buyer_id));
  return true;
end;
$$;

COMMENT ON FUNCTION public.cancel_unpaid_order(p_order_id uuid) IS '未払い注文を本人・運営・決済サーバーだけが取り消せる。確定済み・取消済みは変更しない。';

CREATE FUNCTION public.check_payout_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_available integer;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.payout_accounts a where a.creator_id = new.creator_id) then
      raise exception '振込先口座が登録されていません';
    end if;
    select available_amount into v_available
      from public.creator_payout_balances where creator_id = new.creator_id;
    if new.amount > coalesce(v_available, 0) then
      raise exception '申請額 ¥% が受取可能額 ¥% を超えています', new.amount, coalesce(v_available, 0);
    end if;
    if new.amount < 1000 then
      raise exception '振込の申請は ¥1,000 から受け付けています';
    end if;
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.claim_notification_emails(p_claim_token uuid, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, user_id uuid, email text, digest public.notification_digest, digest_hour smallint, kind public.notification_kind, title text, body text, link_path text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_claim_token is null then raise exception 'claim token is required'; end if;
  return query
    with targets as materialized (
      select * from public.notification_email_targets(p_limit)
    ), locked as (
      select n.id from public.notifications n join targets t on t.id = n.id
        where n.emailed_at is null and (n.email_claimed_until is null or n.email_claimed_until <= now())
        order by n.id for update of n skip locked
    ), claimed as (
      update public.notifications n
        set email_claim_token = p_claim_token, email_claimed_until = now() + interval '5 minutes'
        from locked l where n.id = l.id returning n.id
    )
    select t.* from targets t join claimed c on c.id = t.id order by t.created_at, t.id;
end;
$$;

CREATE FUNCTION public.confirm_demo_order(p_order_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if app.user_id() is null or not found or o.buyer_id is distinct from app.user_id() then
    raise exception using errcode = '42501', message = 'この注文を操作できません';
  end if;
  if o.checkout_started_at is not null or o.stripe_checkout_session_id is not null then
    raise exception '外部決済の履歴があるため、運営へお問い合わせください';
  end if;
  if o.status <> 'payment_pending' then return false; end if;
  update public.orders set is_demo = true where id = o.id;
  return public.confirm_order_payment(o.id, 'demo-' || o.id::text);
end;
$$;

CREATE FUNCTION public.confirm_order_payment(p_order_id uuid, p_payment_ref text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '注文が見つかりません';
  end if;
  if v_order.status <> 'payment_pending' then
    return false;
  end if;

  update public.orders
     set status = 'paid',
         stripe_payment_intent_id = coalesce(p_payment_ref, stripe_payment_intent_id),
         updated_at = now()
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'paid', p_payment_ref, v_order.buyer_id);

  update public.work_variants v
     set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi
   where oi.order_id = p_order_id and v.id = oi.variant_id and v.stock is not null;

  delete from public.cart_items ci
   using public.carts c, public.order_items oi
   where ci.cart_id = c.id and c.user_id = v_order.buyer_id
     and oi.order_id = p_order_id and oi.variant_id = ci.variant_id;

  update public.custom_order_quotes q
     set status = 'ordered', ordered_at = now(), updated_at = now()
    from public.order_items oi
   where oi.order_id = p_order_id and q.variant_id = oi.variant_id and q.status = 'accepted';

  perform public.create_print_jobs_for_order(p_order_id);

  return true;
end;
$$;

COMMENT ON FUNCTION public.confirm_order_payment(p_order_id uuid, p_payment_ref text) IS '支払い完了を反映する。paid → 在庫引き → カート掃除 → 印刷ジョブ生成。冪等。';

CREATE FUNCTION public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer DEFAULT 5) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare
  created integer := 0;
  due timestamptz;
begin
  due := coalesce(
    (select ship_due_at from public.orders where id = p_order_id),
    now() + make_interval(days => p_lead_days)
  );

  update public.orders set ship_due_at = due, status = 'printing_queued', updated_at = now()
   where id = p_order_id;

  insert into public.print_jobs (
    order_id, order_item_id, variant_id, quantity, part_count, batch_count,
    est_filament_grams, est_print_hours, print_fee_snapshot, due_at
  )
  select
    oi.order_id,
    oi.id,
    oi.variant_id,
    oi.quantity,
    coalesce(v.part_count, 1),
    coalesce(v.batch_count, 1),
    v.est_filament_grams * oi.quantity,
    v.est_print_hours * oi.quantity,
    coalesce(oi.print_fee_snapshot, v.print_fee_jpy),
    due
  from public.order_items oi
  left join public.work_variants v on v.id = oi.variant_id
  where oi.order_id = p_order_id
    and not exists (select 1 from public.print_jobs j where j.order_item_id = oi.id);

  get diagnostics created = row_count;
  return created;
end;
$$;

COMMENT ON FUNCTION public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer) IS '決済完了時に注文明細から印刷ジョブを生成する。二重に呼んでも増えない。';

CREATE FUNCTION public.create_revision_from_qc() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  j public.print_jobs;
  v public.work_variants;
  w_id uuid;
  c_id uuid;
begin
  if new.result <> 'failed' or new.reprint_cause <> 'model' then
    return null;
  end if;

  select * into j from public.print_jobs where id = new.print_job_id;
  if not found or j.variant_id is null then return null; end if;

  select * into v from public.work_variants where id = j.variant_id;
  if not found then return null; end if;

  select w.id, w.creator_id into w_id, c_id from public.works w where w.id = v.work_id;
  if w_id is null then return null; end if;

  -- 同じジョブで開いている依頼があれば重ねない
  if exists (
    select 1 from public.revision_requests r
     where r.print_job_id = j.id and r.status in ('open', 'in_progress')
  ) then
    return null;
  end if;

  insert into public.revision_requests (
    work_id, variant_id, creator_id, inspection_id, print_job_id,
    cause, message, photo_paths, reprint_fee_jpy, created_by
  ) values (
    w_id, v.id, c_id, new.id, j.id,
    new.reprint_cause, coalesce(new.memo, '検品で不合格になりました'), new.photo_paths,
    coalesce(j.print_fee_snapshot, v.print_fee_jpy, 0), new.inspector_id
  );

  return null;
end;
$$;

CREATE TABLE public.work_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    size_label text NOT NULL,
    nui_size_cm numeric(4,1),
    scale_ratio numeric(6,4) DEFAULT 1.0 NOT NULL,
    is_base boolean DEFAULT false NOT NULL,
    asset_id uuid,
    bbox_x_mm numeric(8,2),
    bbox_y_mm numeric(8,2),
    bbox_z_mm numeric(8,2),
    est_filament_grams numeric(8,1),
    est_print_hours numeric(6,2),
    part_count integer DEFAULT 1 NOT NULL,
    batch_count integer DEFAULT 1 NOT NULL,
    batch_count_override integer,
    print_fee_jpy integer,
    price_jpy integer,
    stock integer,
    is_listed boolean DEFAULT false NOT NULL,
    is_printable boolean DEFAULT true NOT NULL,
    unprintable_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_part_bbox_x_mm numeric(8,2),
    max_part_bbox_y_mm numeric(8,2),
    max_part_bbox_z_mm numeric(8,2),
    oversized_parts text[] DEFAULT '{}'::text[] NOT NULL,
    fit_width_mm numeric(8,2),
    fit_height_mm numeric(8,2),
    fit_depth_mm numeric(8,2),
    fit_source text DEFAULT 'creator'::text NOT NULL,
    fit_note text,
    CONSTRAINT work_variants_fit_depth_mm_check CHECK (((fit_depth_mm IS NULL) OR (fit_depth_mm > (0)::numeric))),
    CONSTRAINT work_variants_fit_height_mm_check CHECK (((fit_height_mm IS NULL) OR (fit_height_mm > (0)::numeric))),
    CONSTRAINT work_variants_fit_source_check CHECK ((fit_source = ANY (ARRAY['creator'::text, 'auto'::text]))),
    CONSTRAINT work_variants_fit_width_mm_check CHECK (((fit_width_mm IS NULL) OR (fit_width_mm > (0)::numeric))),
    CONSTRAINT work_variants_price_jpy_check CHECK (((price_jpy IS NULL) OR (price_jpy >= 0))),
    CONSTRAINT work_variants_scale_ratio_check CHECK ((scale_ratio > (0)::numeric)),
    CONSTRAINT work_variants_stock_check CHECK (((stock IS NULL) OR (stock >= 0)))
);

COMMENT ON TABLE public.work_variants IS 'サイズ展開。カート・注文が参照する「売る単位」。価格と在庫はここが持つ。';

COMMENT ON COLUMN public.work_variants.max_part_bbox_x_mm IS '一番大きいパーツ単体の寸法。ベッド判定はこちらを使う（bbox_* は組み立て後の表示用）。';

COMMENT ON COLUMN public.work_variants.oversized_parts IS 'ベッドに載らないパーツ名。空でなければ is_printable=false。';

COMMENT ON COLUMN public.work_variants.fit_width_mm IS 'ぬいが収まる幅（座面の幅など）。外形bboxとは別物で、相性判定はこちらを使う。';

COMMENT ON COLUMN public.work_variants.fit_height_mm IS 'ぬいが収まる高さ（背もたれの高さ・天井までの高さなど）。';

COMMENT ON COLUMN public.work_variants.fit_depth_mm IS 'ぬいが収まる奥行。足がはみ出すかどうかの判定に使う。';

COMMENT ON COLUMN public.work_variants.fit_source IS 'creator=STEP3でクリエイターが入力 / auto=メッシュから推定。推定値は表示時に but し書きを出す。';

CREATE FUNCTION public.creator_payout_for(variant public.work_variants) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
declare r public.print_pricing_rules;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  return variant.price_jpy - variant.print_fee_jpy - round(variant.price_jpy * r.platform_fee_rate);
end;
$$;

CREATE FUNCTION public.creator_public_stats(p_creator_id uuid) RETURNS TABLE(works_count integer, follower_count integer, sold_count integer, review_count integer, avg_rating numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    (select count(*) from public.works w where w.creator_id = p_creator_id and w.status = 'published')::integer,
    (select count(*) from public.creator_follows f where f.creator_id = p_creator_id)::integer,
    (select coalesce(sum(oi.quantity), 0)
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
      where oi.creator_id = p_creator_id
        and o.status in ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed'))::integer,
    (select count(*) from public.reviews r where r.creator_id = p_creator_id)::integer,
    (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.creator_id = p_creator_id);
$$;

COMMENT ON FUNCTION public.creator_public_stats(p_creator_id uuid) IS '公開プロフィールの見出しに出す数字。販売実績は支払い済み以降の注文の点数。';

CREATE FUNCTION public.decline_custom_quote(p_quote_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  q public.custom_order_quotes;
  v_user uuid := app.user_id();
begin
  if v_user is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into q from public.custom_order_quotes where id = p_quote_id for update;
  if not found then return false; end if;
  if q.buyer_id is distinct from v_user then
    raise exception 'この見積りを辞退できるのは依頼した本人だけです' using errcode = '42501';
  end if;
  if q.status <> 'sent' then return false; end if;
  update public.custom_order_quotes set status = 'declined', updated_at = now() where id = p_quote_id;
  return true;
end;
$$;

CREATE FUNCTION public.estimate_filament_grams(surface_area_cm2 numeric, volume_cm3 numeric, shell_cm numeric DEFAULT 0.09, infill numeric DEFAULT 0.15, density numeric DEFAULT 1.24) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  select round(
    (least(surface_area_cm2 * shell_cm, volume_cm3)
     + greatest(volume_cm3 - least(surface_area_cm2 * shell_cm, volume_cm3), 0) * infill
    ) * density
  , 1);
$$;

COMMENT ON FUNCTION public.estimate_filament_grams(surface_area_cm2 numeric, volume_cm3 numeric, shell_cm numeric, infill numeric, density numeric) IS '実データ（6パーツ・438g）との誤差 +5.2% で一致することを確認済みの推定式。';

CREATE FUNCTION public.expire_custom_quotes() RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare n integer;
begin
  update public.custom_order_quotes
     set status = 'expired'
   where status = 'sent' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

CREATE FUNCTION public.grant_admin(p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;

  select u.id into v_id
    from public.app_users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;
  if v_id is null then
    raise exception 'そのメールアドレスで登録されたユーザーが見つかりません';
  end if;

  select role into v_role from public.profiles where id = v_id;
  if v_role = 'admin' then
    raise exception 'すでに運営メンバーです';
  end if;

  update public.profiles set role = 'admin', role_before_admin = v_role where id = v_id;
  return v_id;
end;
$$;

COMMENT ON FUNCTION public.grant_admin(p_email text) IS '登録済みユーザーをメールアドレスで指して運営メンバーに上げる。運営だけが呼べる。';

CREATE FUNCTION public.guard_creator_application_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_phone text;
  v_confirmed timestamptz;
begin
  if new.terms_version is null or length(trim(new.terms_version)) = 0 then
    raise exception 'terms_not_agreed'
      using hint = 'クリエイター利用規約への同意が必要です';
  end if;

  select u.phone, u.phone_confirmed_at
    into v_phone, v_confirmed
    from public.app_users u
   where u.id = new.user_id;

  if v_phone is null or v_confirmed is null then
    raise exception 'phone_not_verified'
      using hint = 'SMS で電話番号の認証を済ませてください';
  end if;

  -- アプリが何を渡してきても、認証済みの値で上書きする
  new.phone := v_phone;
  new.phone_verified_at := v_confirmed;
  new.terms_agreed_at := now();
  return new;
end;
$$;

COMMENT ON FUNCTION public.guard_creator_application_insert() IS 'クリエイター申請の insert 前に、SMS 認証済みと規約同意を検査し、番号と同意時刻を写す';

CREATE FUNCTION public.guard_profile_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.role is distinct from old.role
     and current_user in ('app_user', 'app_guest')
     and not public.is_admin() then
    raise exception 'role は運営だけが変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;

COMMENT ON FUNCTION public.guard_profile_role() IS 'profiles.role を一般ユーザーが自分で書き換えるのを止める（自己昇格の防止）。';

CREATE FUNCTION public.handle_creator_application_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.profiles
    set role = 'creator'
    where id = new.user_id
      and role = 'buyer'; -- 既にcreator/adminの場合は上書きしない

    new.reviewed_at = coalesce(new.reviewed_at, now());
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;

  return new;
end;
$$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.name, ''), split_part(new.email, '@', 1)));

  insert into public.carts (user_id) values (new.id);

  return new;
end;
$$;

CREATE FUNCTION public.invalidate_tryon_renders() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.asset_id is distinct from old.asset_id
     or new.scale_ratio is distinct from old.scale_ratio then
    delete from public.tryon_renders where variant_id = new.id;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = app.user_id() and role = 'admin'
  );
$$;

CREATE FUNCTION public.judge_axis(p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric DEFAULT 40) RETURNS public.fit_verdict
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_slot_mm is null or p_nui_mm is null then 'unknown'::public.fit_verdict
    when p_slot_mm < p_nui_mm                  then 'too_small'
    when p_slot_mm - p_nui_mm < 5              then 'tight'
    when p_slot_mm - p_nui_mm > p_loose_mm     then 'loose'
    else 'good'
  end;
$$;

COMMENT ON FUNCTION public.judge_axis(p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric) IS '1軸ぶんの判定。5mm 未満は「ぴったり」、40mm 超は「大きめ」。しきい値は表示文言と対応。';

CREATE FUNCTION public.list_admin_members() RETURNS TABLE(id uuid, display_name text, email text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.created_at
      from public.profiles p
      join public.app_users u on u.id = p.id
     where p.role = 'admin'
     order by p.created_at;
end;
$$;

CREATE FUNCTION public.mark_all_notifications_read() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with upd as (
    update public.notifications set read_at = now()
     where user_id = app.user_id() and read_at is null
     returning 1
  ) select count(*)::integer from upd;
$$;

COMMENT ON FUNCTION public.mark_all_notifications_read() IS '通知一覧の「すべて既読にする」。';

CREATE FUNCTION public.notification_email_targets(p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, user_id uuid, email text, digest public.notification_digest, digest_hour smallint, kind public.notification_kind, title text, body text, link_path text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select n.id, n.user_id, coalesce(ns.email_to, u.email)::text,
         coalesce(ns.digest, 'instant'::public.notification_digest),
         coalesce(ns.digest_hour, 20::smallint),
         n.kind, n.title, n.body, n.link_path, n.created_at
    from public.notifications n
    join public.app_users u on u.id = n.user_id
    left join public.notification_settings ns on ns.user_id = n.user_id
    left join public.notification_preferences np on np.user_id = n.user_id and np.kind = n.kind
   where n.emailed_at is null
     and (n.email_claimed_until is null or n.email_claimed_until <= now())
     and coalesce(np.email, true)
     and n.created_at > now() - interval '7 days'
     and coalesce(ns.email_to, u.email) is not null
     -- 時刻判定はLIMITの前。未到来のdailyが後続のinstantを塞がない。
     and (coalesce(ns.digest, 'instant') = 'instant'
       or coalesce(ns.digest_hour, 20) = extract(hour from now() at time zone 'Asia/Tokyo'))
   order by n.created_at, n.id
   limit greatest(1, least(coalesce(p_limit, 200), 200));
$$;

COMMENT ON FUNCTION public.notification_email_targets(p_limit integer) IS 'メールで送るべき通知を宛先つきで返す。送信後は notifications.emailed_at を立てる。app_service 専用。';

CREATE FUNCTION public.notify_on_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
begin
  if new.answer is not null and old.answer is null then
    select title into v_title from public.works where id = new.work_id;
    perform public.push_notification(
      new.asker_id, 'message',
      '質問に回答がありました',
      coalesce(v_title, '作品') || ' ／ ' || left(new.answer, 60),
      '/works/' || new.work_id::text || '/qa',
      'qna_threads', new.id);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_creator_application_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'approved' then
    perform public.push_notification(
      new.user_id, 'creator',
      'クリエイター登録が承認されました',
      '作品の投稿ができるようになりました。まずは作品管理から3Dデータを登録してください。',
      '/studio/works',
      'creator_applications', new.id);
  elsif new.status = 'rejected' then
    perform public.push_notification(
      new.user_id, 'creator',
      'クリエイター申請は承認されませんでした',
      coalesce('運営より：' || nullif(trim(new.admin_note), ''),
               '内容を見直して、あらためて申請できます。'),
      '/creator/apply',
      'creator_applications', new.id);
  end if;
  return null;
end;
$$;

COMMENT ON FUNCTION public.notify_on_creator_application_review() IS 'クリエイター申請の承認・却下を申請者に通知する（after update, status が変わったときだけ）';

CREATE FUNCTION public.notify_on_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.sender_id;
  perform public.push_notification(
    new.recipient_id, 'message',
    coalesce(v_name, 'ユーザー') || ' さんからメッセージが届きました',
    left(new.body, 60),
    '/mypage/messages?with=' || new.sender_id::text,
    'messages', new.id);
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_payout() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    perform public.push_notification(
      new.creator_id, 'creator',
      '振込が完了しました',
      '¥' || to_char(new.amount, 'FM999,999,999') || ' を振り込みました',
      '/studio/payouts', 'payout_requests', new.id);
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    perform public.push_notification(
      new.creator_id, 'creator',
      '振込の申請が差し戻されました',
      '¥' || to_char(new.amount, 'FM999,999,999') || ' の申請を確認してください',
      '/studio/payouts', 'payout_requests', new.id);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_price_drop() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
begin
  if new.min_price_jpy is null
     or new.previous_min_price_jpy is null
     or new.min_price_jpy >= new.previous_min_price_jpy then
    return null;
  end if;

  for r in
    select f.user_id from public.work_favorites f where f.work_id = new.id
  loop
    perform public.push_notification(
      r.user_id, 'favorite_price',
      'お気に入りの作品が値下げされました',
      new.title || '　¥' || to_char(new.previous_min_price_jpy, 'FM999,999')
                 || ' → ¥' || to_char(new.min_price_jpy, 'FM999,999'),
      '/works/' || new.id::text,
      'works_price', gen_random_uuid());   -- 値下げのたびに別通知にする
  end loop;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_print_start() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_buyer uuid;
begin
  if new.status = 'printing' and (old.status is distinct from 'printing') then
    select o.buyer_id into v_buyer
      from public.orders o where o.id = new.order_id;
    perform public.push_notification(
      v_buyer, 'order_shipping',
      '印刷を開始しました',
      'ジョブ ' || coalesce(new.job_no, new.id::text),
      '/mypage/orders/' || new.order_id::text,
      'print_jobs', new.id);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_question() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_creator uuid;
  v_title text;
begin
  select creator_id, title into v_creator, v_title from public.works where id = new.work_id;
  if v_creator is null or v_creator = new.asker_id then return null; end if;
  perform public.push_notification(
    v_creator, 'creator',
    '作品に質問が届きました',
    coalesce(v_title, '作品') || ' ／ ' || left(new.question, 60),
    '/works/' || new.work_id::text || '/qa',
    'qna_threads', new.id);
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_quote_sent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_creator_name text;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    perform public.push_notification(
      new.buyer_id, 'message',
      'オーダーメイドの見積りが届きました',
      coalesce(new.quote_no, '見積り')
        || ' ／ 合計 ¥'
        || to_char(new.price_jpy + new.print_fee_jpy + new.shipping_fee_jpy, 'FM999,999')
        || ' ／ 有効期限 ' || to_char(new.expires_at, 'MM月DD日'),
      '/mypage/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  elsif tg_op = 'UPDATE' and new.status in ('accepted', 'declined', 'ordered') and old.status is distinct from new.status then
    select display_name into v_creator_name from public.profiles where id = new.buyer_id;
    perform public.push_notification(
      new.creator_id, 'creator',
      case new.status
        when 'accepted' then '見積りが承認されました'
        when 'ordered'  then 'オーダーメイドが注文されました'
        else '見積りが辞退されました'
      end,
      coalesce(new.quote_no, '見積り') || ' ／ ' || coalesce(v_creator_name, '購入者') || ' さん',
      '/studio/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  elsif tg_op = 'UPDATE' and new.status = 'expired' and old.status is distinct from 'expired' then
    -- 期限切れ。買う人には「もう一度相談できる」、作る人には「承認されなかった」を伝える
    perform public.push_notification(
      new.buyer_id, 'message',
      '見積りの有効期限が切れました',
      coalesce(new.quote_no, '見積り') || ' ／ 続けたい場合は相談から見積りを依頼し直してください',
      '/mypage/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
    perform public.push_notification(
      new.creator_id, 'creator',
      '見積りの有効期限が切れました',
      coalesce(new.quote_no, '見積り') || ' ／ 承認されないまま期限を過ぎました',
      '/studio/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
begin
  select title into v_title from public.works where id = new.work_id;
  perform public.push_notification(
    new.creator_id, 'review',
    'レビューが届きました',
    coalesce(v_title, '作品') || ' に ★' || new.rating || ' のレビューが付きました',
    '/works/' || new.work_id::text || '/reviews',
    'reviews', new.id);
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_revision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.push_notification(
    new.creator_id, 'creator',
    '検品で修正依頼が発生しました',
    coalesce(new.revision_no, '修正依頼') || ' ／ 原因: ' || new.cause::text
      || ' ／ 期限 ' || to_char(new.due_at, 'MM月DD日'),
    '/studio/revisions/' || new.id::text,
    'revision_requests', new.id);
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_sale() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  i record;
begin
  if new.status = 'paid' and old.status = 'payment_pending' then
    for i in
      select oi.creator_id, oi.quantity, oi.creator_payout_amount, oi.id, w.title
        from public.order_items oi
        left join public.works w on w.id = oi.work_id
       where oi.order_id = new.id
    loop
      perform public.push_notification(
        i.creator_id, 'creator',
        '作品が売れました',
        coalesce(i.title, '作品') || ' ×' || i.quantity
          || ' ／ 受取（見込み） ¥' || to_char(i.creator_payout_amount, 'FM999,999'),
        '/studio',
        'order_items', i.id);
    end loop;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.notify_on_shipment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.orders where id = new.order_id;
  perform public.push_notification(
    v_buyer, 'order_shipping',
    'ご注文の商品を発送しました',
    coalesce(new.service_name, '宅配便')
      || case when new.tracking_number is not null
              then ' ／ 追跡番号 ' || new.tracking_number else '' end,
    '/mypage/orders/' || new.order_id::text,
    'shipments', new.id);
  return null;
end;
$$;

CREATE FUNCTION public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid) RETURNS TABLE(axis text, slot_mm numeric, nui_mm numeric, margin_mm numeric, verdict public.fit_verdict)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with v as (select * from public.work_variants where id = p_variant_id),
       n as (select * from public.nui_profiles   where id = p_nui_id)
  select a.axis, a.slot_mm, a.nui_mm,
         case when a.slot_mm is null or a.nui_mm is null then null
              else round(a.slot_mm - a.nui_mm, 1) end as margin_mm,
         public.judge_axis(a.slot_mm, a.nui_mm, a.loose_mm) as verdict
    from v, n,
    lateral (values
      ('width',  v.fit_width_mm,  coalesce(n.hug_width_mm, n.shoulder_width_mm), 40::numeric),
      ('height', v.fit_height_mm, n.sit_height_mm,                               40::numeric),
      ('depth',  v.fit_depth_mm,  coalesce(n.hug_width_mm, n.shoulder_width_mm), 60::numeric)
    ) as a(axis, slot_mm, nui_mm, loose_mm);
$$;

CREATE FUNCTION public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid) RETURNS TABLE(variant_id uuid, size_label text, nui_size_cm numeric, price_jpy integer, is_listed boolean, verdict public.fit_verdict, note text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select v.id, v.size_label, v.nui_size_cm, v.price_jpy, v.is_listed,
         public.nui_fit_verdict(v.id, p_nui_id) as verdict,
         case public.nui_fit_verdict(v.id, p_nui_id)
           when 'too_small' then (select n.name from public.nui_profiles n where n.id = p_nui_id)
                                 || 'には小さすぎます'
           when 'tight'     then 'ぴったり収まります'
           when 'good'      then 'この子にちょうどいい'
           when 'loose'     then '余裕はあるが大きめ'
           else '内寸が未登録のため判定できません'
         end as note
    from public.work_variants v
   where v.work_id = p_work_id
   order by v.nui_size_cm nulls last, v.size_label;
$$;

COMMENT ON FUNCTION public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid) IS '作品詳細「うちの子で見る」のサイズ一覧。判定は合成画像ではなく内寸の数値で出す。';

CREATE FUNCTION public.nui_fit_verdict(p_variant_id uuid, p_nui_id uuid) RETURNS public.fit_verdict
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with x as (select * from public.nui_fit_axes(p_variant_id, p_nui_id))
  select case
    when (select count(*) from x where verdict = 'unknown') = 3 then 'unknown'::public.fit_verdict
    when exists (select 1 from x where axis in ('width','height') and verdict = 'too_small') then 'too_small'
    when (select count(*) from x where verdict = 'loose') >= 2 then 'loose'
    when exists (select 1 from x where verdict = 'tight') then 'tight'
    else 'good'
  end;
$$;

CREATE FUNCTION public.order_actual_print_cost(p_order_id uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r public.print_pricing_rules;
  j record;
  material_cost numeric;
  total numeric := 0;
  job_count integer := 0;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then return null; end if;

  for j in
    select id, actual_filament_grams, actual_print_hours, part_count, quantity
      from public.print_jobs
     where order_id = p_order_id and status <> 'cancelled'
  loop
    job_count := job_count + 1;
    if j.actual_filament_grams is null or j.actual_print_hours is null then
      return null;
    end if;

    -- 台帳に「印刷で消費」があれば、実際に使ったフィラメントの単価で
    select sum(-l.delta_grams * f.price_per_gram)
      into material_cost
      from public.filament_ledger l
      join public.filaments f on f.id = l.filament_id
     where l.print_job_id = j.id and l.reason = 'print';

    if material_cost is null then
      material_cost := j.actual_filament_grams * r.material_yen_per_gram;
    end if;

    total := total
      + round(material_cost)
      + round(j.actual_print_hours * r.machine_yen_per_hour)
      + r.handling_base_yen
      + r.handling_per_part_yen * greatest(j.part_count, 1) * greatest(j.quantity, 1);
  end loop;

  if job_count = 0 then return null; end if;
  return total::integer;
end;
$$;

COMMENT ON FUNCTION public.order_actual_print_cost(p_order_id uuid) IS '注文の印刷実費（材料・機械時間・検品梱包）。実績未入力のジョブがあれば null。';

CREATE FUNCTION public.order_has_creator_items(p_order_id uuid, p_creator_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.order_items oi
     where oi.order_id = p_order_id and oi.creator_id = p_creator_id
  );
$$;

CREATE FUNCTION public.order_item_settlement_amounts(p_order_id uuid) RETURNS TABLE(item_id uuid, fee_amount integer, payout_amount integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with weights as (
    select oi.id, oi.creator_id,
      case when sum(oi.unit_price::numeric * oi.quantity) over () = 0 then 1
           else oi.unit_price::numeric * oi.quantity end as weight
    from public.order_items oi where oi.order_id = p_order_id
  ), shares as materialized (
    select *, sum(weight) over (order by id rows unbounded preceding) as through,
              sum(weight) over () as total
    from weights
  )
  select i.id,
    (round(s.fee_amount * i.through / i.total) - round(s.fee_amount * (i.through - i.weight) / i.total))::integer,
    (round(s.payout_amount * i.through / i.total) - round(s.payout_amount * (i.through - i.weight) / i.total))::integer
  from shares i cross join public.order_settlements s
  where s.order_id = p_order_id
    and (app.current_role() = 'app_service' or public.is_admin()
         or s.buyer_id = app.user_id() or i.creator_id = app.user_id());
$$;

CREATE FUNCTION public.place_demo_order(p_address_id uuid, p_request_id uuid, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid := app.user_id();
  v_order_id uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;
  if p_request_id is null or length(p_note) > 500 then
    raise exception '注文の入力内容が不正です';
  end if;
  -- 同じ購入者の同時注文を直列化し、カートを二度確定しない。
  perform 1 from public.carts where user_id = v_user for update;
  select id into v_order_id from public.orders
    where buyer_id = v_user and checkout_request_id = p_request_id;
  if found then return v_order_id; end if;

  -- 在庫の確認から減算まで、購入するバリアントをID順にロックする。
  perform v.id from public.work_variants v
    join public.cart_items ci on ci.variant_id = v.id
    join public.carts c on c.id = ci.cart_id
    where c.user_id = v_user order by v.id for update of v;
  v_order_id := public.place_order(p_address_id, p_note);
  update public.orders set checkout_request_id = p_request_id where id = v_order_id;
  perform public.confirm_demo_order(v_order_id);
  return v_order_id;
end;
$$;

CREATE FUNCTION public.place_order(p_address_id uuid, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := app.user_id();
  v_rule public.print_pricing_rules;
  v_order_id uuid;
  v_subtotal integer := 0;
  v_print integer := 0;
  v_fee integer := 0;
  v_count integer := 0;
  l record;
begin
  if v_user is null then
    raise exception 'ログインが必要です';
  end if;
  if not exists (select 1 from public.addresses a where a.id = p_address_id and a.user_id = v_user) then
    raise exception 'お届け先が見つかりません';
  end if;

  select * into v_rule from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な料金表がありません';
  end if;

  for l in
    select ci.quantity, p.*, w.title, w.status as work_status, w.creator_id,
           public.variant_reserved_for(p.id, v_user) as reserved
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
      join public.work_variant_pricing p on p.id = ci.variant_id
      join public.works w on w.id = p.work_id
     where c.user_id = v_user
  loop
    if not l.reserved and (l.work_status <> 'published' or not l.is_listed) then
      raise exception '「%」は現在購入できません', l.title;
    end if;
    if not l.is_printable then
      raise exception '「%」（%）は造形できないサイズです', l.title, l.size_label;
    end if;
    if l.stock is not null and l.stock < l.quantity then
      raise exception '「%」（%）の在庫が足りません（残り %）', l.title, l.size_label, l.stock;
    end if;
    if l.price_jpy is null or l.buyer_total_jpy is null then
      raise exception '「%」（%）の価格が決まっていません', l.title, l.size_label;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'カートが空です';
  end if;

  insert into public.orders (
    buyer_id, status, subtotal_amount, platform_fee_amount, print_cost_amount,
    shipping_fee_amount, total_amount, shipping_address_id
  ) values (v_user, 'payment_pending', 0, 0, 0, v_rule.shipping_fee_jpy, 0, p_address_id)
  returning id into v_order_id;

  insert into public.order_items (
    order_id, work_id, creator_id, variant_id, size_label_snapshot,
    unit_price, quantity, creator_payout_amount, platform_fee_amount,
    print_cost_amount, print_fee_snapshot,
    stl_storage_path_snapshot, filament_material_snapshot, filament_color_snapshot,
    color_slots_snapshot, part_instructions_snapshot
  )
  select
    v_order_id, p.work_id, w.creator_id, p.id, p.size_label,
    p.price_jpy, ci.quantity,
    p.creator_payout_jpy * ci.quantity,
    (p.price_jpy - p.creator_payout_jpy) * ci.quantity,
    p.print_fee_jpy * ci.quantity, p.print_fee_jpy,
    coalesce((select a.storage_path from public.work_assets a where a.work_id = p.work_id and a.is_primary limit 1), ''),
    coalesce((select f.material::text from public.work_color_slots cs join public.filaments f on f.id = cs.filament_id
               where cs.work_id = p.work_id order by cs.slot_index limit 1), '未指定'),
    coalesce((select f.color_name from public.work_color_slots cs join public.filaments f on f.id = cs.filament_id
               where cs.work_id = p.work_id order by cs.slot_index limit 1), '未指定'),
    coalesce((select jsonb_agg(jsonb_build_object(
                'slot_index', cs.slot_index, 'source_name', cs.source_name,
                'material', f.material, 'color_name', f.color_name, 'color_hex', f.color_hex)
                order by cs.slot_index)
              from public.work_color_slots cs
              left join public.filaments f on f.id = cs.filament_id
              where cs.work_id = p.work_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'part', o.name, 'orientation', pi.orientation, 'support', pi.support,
                'support_note', pi.support_note, 'note', pi.note)
                order by o.object_index)
              from public.work_part_instructions pi
              join public.work_asset_objects o on o.id = pi.object_id
              where pi.work_id = p.work_id and (pi.variant_id is null or pi.variant_id = p.id)), '[]'::jsonb)
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  join public.work_variant_pricing p on p.id = ci.variant_id
  join public.works w on w.id = p.work_id
  where c.user_id = v_user;

  select sum(unit_price * quantity), sum(print_cost_amount), sum(platform_fee_amount)
    into v_subtotal, v_print, v_fee
    from public.order_items where order_id = v_order_id;

  update public.orders
     set subtotal_amount = v_subtotal,
         print_cost_amount = v_print,
         platform_fee_amount = v_fee,
         total_amount = v_subtotal + v_print + v_rule.shipping_fee_jpy
   where id = v_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order_id, 'payment_pending', p_note, v_user);

  return v_order_id;
end;
$$;

COMMENT ON FUNCTION public.place_order(p_address_id uuid, p_note text) IS 'カートの中身から支払い前の注文を作る。買えないものがあれば例外で止める。返り値は注文ID。';

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role public.user_role DEFAULT 'buyer'::public.user_role NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    bio text,
    sns_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_before_admin public.user_role
);

COMMENT ON TABLE public.profiles IS 'public.app_usersに紐づくプロフィール。1ユーザーが購入者・クリエイターを兼務可能（roleはクリエイター申請可否のフラグ用途）';

COMMENT ON COLUMN public.profiles.role_before_admin IS '運営メンバーに上げる前の役割。解除したときにここへ戻す。運営でない人は null。';

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    work_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    rating smallint NOT NULL,
    comment text,
    photo_storage_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    design_rating smallint,
    accuracy_rating smallint,
    size_fit_rating smallint,
    print_quality_rating smallint,
    packaging_rating smallint,
    shipping_rating smallint,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT reviews_accuracy_rating_check CHECK (((accuracy_rating >= 1) AND (accuracy_rating <= 5))),
    CONSTRAINT reviews_design_rating_check CHECK (((design_rating >= 1) AND (design_rating <= 5))),
    CONSTRAINT reviews_packaging_rating_check CHECK (((packaging_rating >= 1) AND (packaging_rating <= 5))),
    CONSTRAINT reviews_print_quality_rating_check CHECK (((print_quality_rating >= 1) AND (print_quality_rating <= 5))),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_shipping_rating_check CHECK (((shipping_rating >= 1) AND (shipping_rating <= 5))),
    CONSTRAINT reviews_size_fit_rating_check CHECK (((size_fit_rating >= 1) AND (size_fit_rating <= 5)))
);

COMMENT ON COLUMN public.reviews.rating IS 'クリエイターへの総合評価。プロフィールに表示される星はこれと下の3軸から出す。';

COMMENT ON COLUMN public.reviews.design_rating IS 'デザイン・完成度（クリエイターへの評価）';

COMMENT ON COLUMN public.reviews.accuracy_rating IS '写真・説明との一致（クリエイターへの評価）';

COMMENT ON COLUMN public.reviews.size_fit_rating IS 'サイズ感・飾りやすさ（クリエイターへの評価）';

COMMENT ON COLUMN public.reviews.print_quality_rating IS '印刷品質（運営への評価・任意）。クリエイターの平均点には含めない。';

COMMENT ON COLUMN public.reviews.packaging_rating IS '梱包（運営への評価・任意）';

COMMENT ON COLUMN public.reviews.shipping_rating IS '発送の速さ（運営への評価・任意）';

CREATE TABLE public.works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status public.work_status DEFAULT 'draft'::public.work_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepts_color_change boolean DEFAULT false NOT NULL,
    accepts_mirror boolean DEFAULT false NOT NULL,
    accepts_stand_hole boolean DEFAULT false NOT NULL,
    accepts_custom_size boolean DEFAULT false NOT NULL,
    accepts_other_request boolean DEFAULT false NOT NULL,
    favorite_count integer DEFAULT 0 NOT NULL,
    min_price_jpy integer,
    previous_min_price_jpy integer,
    price_changed_at timestamp with time zone,
    min_buyer_total_jpy integer,
    CONSTRAINT works_favorite_count_check CHECK ((favorite_count >= 0))
);

COMMENT ON TABLE public.works IS '作品の共通メタ。価格・在庫・印刷仕様は work_variants / work_assets が持つ。';

COMMENT ON COLUMN public.works.favorite_count IS 'お気に入り数。work_favorites の増減にトリガーで追随する集計列。並べ替えの基準。';

COMMENT ON COLUMN public.works.min_price_jpy IS '出品中バリアントの最安値。カードの「¥1,800〜」表示と価格帯の絞り込みに使う。';

COMMENT ON COLUMN public.works.previous_min_price_jpy IS '直前の最安値。これより min_price_jpy が下がっていれば値下げとして扱う。';

COMMENT ON COLUMN public.works.min_buyer_total_jpy IS '出品中サイズのうち、買う人が払う額（price_jpy + 代行費）の最小値。カードの表示と価格の並べ替えに使う。';

CREATE VIEW public.work_list_items WITH (security_invoker='on') AS
 SELECT w.id,
    w.creator_id,
    p.display_name AS creator_name,
    w.title,
    w.status,
    w.favorite_count,
    w.min_price_jpy,
    w.previous_min_price_jpy,
    w.price_changed_at,
    ((w.previous_min_price_jpy IS NOT NULL) AND (w.min_price_jpy IS NOT NULL) AND (w.min_price_jpy < w.previous_min_price_jpy) AND (w.price_changed_at > (now() - '7 days'::interval))) AS is_price_dropped,
    (EXISTS ( SELECT 1
           FROM public.work_variants v
          WHERE ((v.work_id = w.id) AND v.is_listed AND v.is_printable))) AS is_available,
    (EXISTS ( SELECT 1
           FROM public.work_variants v
          WHERE ((v.work_id = w.id) AND v.is_listed AND (COALESCE(v.stock, 0) > 0)))) AS has_stock,
    COALESCE(r.review_count, 0) AS review_count,
    r.avg_rating,
    w.created_at,
    w.min_buyer_total_jpy
   FROM ((public.works w
     JOIN public.profiles p ON ((p.id = w.creator_id)))
     LEFT JOIN ( SELECT reviews.work_id,
            (count(*))::integer AS review_count,
            round(avg(reviews.rating), 1) AS avg_rating
           FROM public.reviews
          GROUP BY reviews.work_id) r ON ((r.work_id = w.id)));

COMMENT ON VIEW public.work_list_items IS '作品一覧・検索結果・お気に入り一覧が共通で読むビュー。並べ替えのキー（favorite_count / min_price_jpy / avg_rating / created_at）をすべて持つ。';

CREATE FUNCTION public.popular_works(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_nui_size_cm numeric DEFAULT NULL::numeric) RETURNS SETOF public.work_list_items
    LANGUAGE sql STABLE
    AS $$
  select l.*
    from public.work_list_items l
   where l.status = 'published'
     and l.is_available
     and (
       p_nui_size_cm is null
       or exists (
         select 1 from public.work_variants v
          where v.work_id = l.id and v.is_listed and v.nui_size_cm = p_nui_size_cm
       )
     )
   order by l.favorite_count desc, l.created_at desc
   limit p_limit offset p_offset;
$$;

COMMENT ON FUNCTION public.popular_works(p_limit integer, p_offset integer, p_nui_size_cm numeric) IS '「お気に入りが多い順」の一覧。対応ぬいサイズでの絞り込みに対応する。';

CREATE FUNCTION public.purge_old_notifications() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with del as (
    delete from public.notifications
     where created_at < now() - interval '30 days'
     returning 1
  ) select count(*)::integer from del;
$$;

COMMENT ON FUNCTION public.purge_old_notifications() IS '保守処理専用。30日より古い通知を削除する。利用者から直接呼ばない。';

CREATE FUNCTION public.push_notification(p_user_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link_path text, p_source_table text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_in_app boolean;
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  select in_app into v_in_app
    from public.notification_preferences
   where user_id = p_user_id and kind = p_kind;

  -- 行がなければ既定ON。必須種別は設定を無視して通す。
  if p_kind in ('order_shipping', 'creator') then
    v_in_app := true;
  end if;
  v_in_app := coalesce(v_in_app, true);

  if not v_in_app then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, link_path, source_table, source_id)
  values (p_user_id, p_kind, p_title, p_body, p_link_path, p_source_table, p_source_id)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

COMMENT ON FUNCTION public.push_notification(p_user_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link_path text, p_source_table text, p_source_id uuid) IS 'DB トリガー内部から通知を作成する。アプリ・公開 RPC から直接呼ばない。';

CREATE TABLE public.custom_order_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_no text,
    request_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    base_work_id uuid,
    status public.quote_status DEFAULT 'draft'::public.quote_status NOT NULL,
    spec jsonb DEFAULT '[]'::jsonb NOT NULL,
    asset_id uuid,
    est_filament_grams numeric(8,1),
    est_print_hours numeric(6,2),
    part_count integer DEFAULT 1 NOT NULL,
    max_part_bbox_x_mm numeric(8,2),
    max_part_bbox_y_mm numeric(8,2),
    max_part_bbox_z_mm numeric(8,2),
    price_jpy integer NOT NULL,
    print_fee_jpy integer DEFAULT 0 NOT NULL,
    shipping_fee_jpy integer DEFAULT 0 NOT NULL,
    lead_time_days integer DEFAULT 10 NOT NULL,
    note text,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    variant_id uuid,
    accepted_at timestamp with time zone,
    ordered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_order_quotes_lead_time_days_check CHECK ((lead_time_days > 0)),
    CONSTRAINT custom_order_quotes_part_count_check CHECK ((part_count > 0)),
    CONSTRAINT custom_order_quotes_price_jpy_check CHECK ((price_jpy >= 0)),
    CONSTRAINT custom_order_quotes_print_fee_jpy_check CHECK ((print_fee_jpy >= 0)),
    CONSTRAINT custom_order_quotes_shipping_fee_jpy_check CHECK ((shipping_fee_jpy >= 0))
);

COMMENT ON TABLE public.custom_order_quotes IS 'オーダーメイド相談に対する見積り。承認されると専用バリアントを作って通常の決済に合流する。';

COMMENT ON COLUMN public.custom_order_quotes.spec IS '確定仕様。[{"label":"サイズ","value":"13cm","requested":"13cmのぬい用がほしい"}] の配列。';

CREATE FUNCTION public.quote_total_jpy(q public.custom_order_quotes) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select q.price_jpy + q.print_fee_jpy + q.shipping_fee_jpy;
$$;

CREATE FUNCTION public.record_print_job_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.print_job_events (print_job_id, status) values (new.id, new.status);
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.revoke_admin(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_next public.user_role;
begin
  if not public.is_admin() then
    raise exception '運営だけが実行できます' using errcode = '42501';
  end if;
  -- 呼び手は運営で、自分は解除できない。だから解除後も運営は必ず1人以上残る
  -- （「最後の1人」の検査はこれで兼ねる）。
  if p_user_id = app.user_id() then
    raise exception '自分自身は解除できません（他の運営メンバーに頼んでください）';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'そのユーザーは運営メンバーではありません';
  end if;

  select coalesce(
           p.role_before_admin,
           case when exists (
                  select 1 from public.creator_applications
                   where user_id = p_user_id and status = 'approved')
                then 'creator'::public.user_role
                else 'buyer'::public.user_role end)
    into v_next
    from public.profiles p where p.id = p_user_id;

  update public.profiles
     set role = v_next, role_before_admin = null
   where id = p_user_id and role = 'admin';
  if not found then
    raise exception 'そのユーザーは運営メンバーではありません';
  end if;
end;
$$;

COMMENT ON FUNCTION public.revoke_admin(p_user_id uuid) IS '運営メンバーを解除して上げる前の役割に戻す。自分自身は解除できない（運営が0人にはならない）。';

CREATE FUNCTION public.scale_fit_dims() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  base record;
begin
  -- 基準バリアント（is_base）の内寸から、自分の scale_ratio 倍を入れる。
  -- 自分で値を持っている場合は触らない（サイズ専用データで内寸が変わることがある）。
  if new.is_base or new.fit_width_mm is not null then
    return new;
  end if;

  select fit_width_mm, fit_height_mm, fit_depth_mm into base
    from public.work_variants
   where work_id = new.work_id and is_base and id <> new.id
   limit 1;

  if base.fit_width_mm is not null then
    new.fit_width_mm  := round(base.fit_width_mm  * new.scale_ratio, 2);
    new.fit_height_mm := round(base.fit_height_mm * new.scale_ratio, 2);
    new.fit_depth_mm  := round(base.fit_depth_mm  * new.scale_ratio, 2);
    new.fit_source    := 'auto';
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.set_first_nui_as_main() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if not exists (select 1 from public.nui_profiles where user_id = new.user_id and id <> new.id) then
    update public.nui_profiles set is_main = true where id = new.id;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE FUNCTION public.snapshot_order_fee_rate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.platform_fee_rate is null then
    select platform_fee_rate into new.platform_fee_rate
      from public.print_pricing_rules where is_active limit 1;
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.sync_nui_size() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.nui_size_cm := case
    when new.sit_height_mm < 125 then 10.0
    when new.sit_height_mm < 175 then 15.0
    else 20.0
  end;
  new.updated_at := now();
  return new;
end;
$$;

CREATE FUNCTION public.sync_order_from_jobs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
  total integer;
  passed integer;
  in_progress integer;
begin
  select count(*),
         count(*) filter (where status = 'qc_passed'),
         count(*) filter (where status in ('printing', 'reprinting', 'printed', 'qc_failed'))
    into total, passed, in_progress
    from public.print_jobs where order_id = oid and status <> 'cancelled';

  if total = 0 then
    return null;
  end if;

  update public.orders o
     set status = case
           when passed = total then 'packaging'::public.order_status
           when in_progress > 0 then 'printing'::public.order_status
           else 'printing_queued'::public.order_status
         end,
         updated_at = now()
   where o.id = oid
     and o.status in ('paid', 'printing_queued', 'printing', 'packaging');

  return null;
end;
$$;

CREATE FUNCTION public.sync_work_favorite_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.works set favorite_count = favorite_count + 1 where id = new.work_id;
  elsif tg_op = 'DELETE' then
    -- 同時実行で負にならないよう greatest で止める
    update public.works
       set favorite_count = greatest(favorite_count - 1, 0)
     where id = old.work_id;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.sync_work_min_price() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  target uuid := coalesce(new.work_id, old.work_id);
  new_min integer;
  old_min integer;
  new_buyer_min integer;
begin
  select min(price_jpy) into new_min
    from public.work_variants
   where work_id = target and is_listed and price_jpy is not null;

  select min(buyer_total_jpy) into new_buyer_min
    from public.work_variant_pricing
   where work_id = target and is_listed and buyer_total_jpy is not null;

  select min_price_jpy into old_min from public.works where id = target;

  if new_min is distinct from old_min then
    update public.works
       set previous_min_price_jpy = old_min,
           min_price_jpy = new_min,
           min_buyer_total_jpy = new_buyer_min,
           price_changed_at = now()
     where id = target;
  else
    update public.works
       set min_buyer_total_jpy = new_buyer_min
     where id = target and min_buyer_total_jpy is distinct from new_buyer_min;
  end if;

  return null;
end;
$$;

CREATE FUNCTION public.sync_work_variant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  r public.print_pricing_rules;
  floor_price integer;
  fit_x numeric;
  fit_y numeric;
  fit_z numeric;
begin
  select * into r from public.print_pricing_rules where is_active limit 1;
  if not found then
    raise exception '有効な print_pricing_rules がありません';
  end if;

  new.print_fee_jpy := public.calc_print_fee(new.est_filament_grams, new.est_print_hours, new.part_count);

  -- 最大パーツの寸法があればそれで、なければ従来どおり作品全体の寸法で判定する
  fit_x := coalesce(new.max_part_bbox_x_mm, new.bbox_x_mm);
  fit_y := coalesce(new.max_part_bbox_y_mm, new.bbox_y_mm);
  fit_z := coalesce(new.max_part_bbox_z_mm, new.bbox_z_mm);

  if fit_x is not null and fit_y is not null then
    if (greatest(fit_x, fit_y) > greatest(r.bed_x_mm, r.bed_y_mm))
       or (least(fit_x, fit_y) > least(r.bed_x_mm, r.bed_y_mm))
       or (coalesce(fit_z, 0) > r.bed_z_mm) then
      new.is_printable := false;
      new.unprintable_reason := format(
        '%sが %s×%s×%s mm でベッド上限 %s×%s×%s mm を超過',
        case when array_length(new.oversized_parts, 1) is null
             then '造形サイズ'
             else 'パーツ「' || new.oversized_parts[1] || '」' end,
        round(fit_x, 1), round(fit_y, 1), round(fit_z, 1),
        r.bed_x_mm, r.bed_y_mm, r.bed_z_mm);
      new.is_listed := false;
    else
      new.is_printable := true;
      new.unprintable_reason := null;
    end if;
  end if;

  if new.batch_count_override is not null then
    new.batch_count := greatest(new.batch_count_override, 1);
  elsif new.est_print_hours is not null then
    new.batch_count := greatest(ceil(new.est_print_hours / r.max_batch_hours)::integer, 1);
  end if;

  if new.is_listed and new.price_jpy is not null then
    if r.fee_billing = 'bundled' then
      floor_price := ceil(new.print_fee_jpy / (1 - r.platform_fee_rate))::integer;
      if new.price_jpy < floor_price then
        raise exception '販売価格 ¥% は下限 ¥% を下回っています（印刷代行費 ¥%、手数料率 % パーセント）',
          new.price_jpy, floor_price, new.print_fee_jpy, round(r.platform_fee_rate * 100);
      end if;
    elsif new.price_jpy < 100 then
      raise exception '販売価格 ¥% が下限 ¥100 を下回っています', new.price_jpy;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

CREATE FUNCTION public.touch_print_job() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'printing' and old.status is distinct from 'printing' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status in ('printed', 'qc_passed') and new.finished_at is null then
    new.finished_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

CREATE FUNCTION public.unread_notification_count() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::integer from public.notifications
   where user_id = app.user_id() and read_at is null;
$$;

CREATE FUNCTION public.variant_reserved_for(p_variant_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.custom_order_quotes q
     where q.variant_id = p_variant_id and q.buyer_id = p_user_id and q.status in ('accepted', 'ordered')
  );
$$;

CREATE FUNCTION public.work_reserved_for(p_work_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.custom_order_quotes q
    join public.work_variants v on v.id = q.variant_id
     where v.work_id = p_work_id and q.buyer_id = p_user_id and q.status in ('accepted', 'ordered')
  );
$$;

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recipient_name text NOT NULL,
    postal_code text NOT NULL,
    prefecture text NOT NULL,
    city text NOT NULL,
    address_line text NOT NULL,
    phone text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.coordinate_post_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    work_id uuid NOT NULL,
    x_percent numeric(5,2) NOT NULL,
    y_percent numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coordinate_post_pins_x_percent_check CHECK (((x_percent >= (0)::numeric) AND (x_percent <= (100)::numeric))),
    CONSTRAINT coordinate_post_pins_y_percent_check CHECK (((y_percent >= (0)::numeric) AND (y_percent <= (100)::numeric)))
);

CREATE TABLE public.coordinate_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    image_storage_path text NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.creator_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.creator_application_status DEFAULT 'pending'::public.creator_application_status NOT NULL,
    message text DEFAULT ''::text,
    admin_note text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    phone_verified_at timestamp with time zone,
    terms_version text,
    terms_agreed_at timestamp with time zone,
    portfolio_url text,
    CONSTRAINT creator_applications_portfolio_url_check CHECK (((portfolio_url IS NULL) OR (portfolio_url ~* '^https?://'::text)))
);

COMMENT ON TABLE public.creator_applications IS 'buyer→creatorへのロール変更申請。承認されると handle_creator_application_approval トリガーが profiles.role を更新する';

COMMENT ON COLUMN public.creator_applications.message IS '活動内容（任意・現在の申請画面では入力しない）';

COMMENT ON COLUMN public.creator_applications.phone IS '申請時点で SMS 認証済みだった電話番号（E.164）。トリガーが public.app_users から写す';

COMMENT ON COLUMN public.creator_applications.phone_verified_at IS 'その番号を認証した時刻（public.app_users.phone_confirmed_at の写し）';

COMMENT ON COLUMN public.creator_applications.terms_version IS '同意したクリエイター利用規約のバージョン（例 2026-09-08）。未同意なら申請できない';

COMMENT ON COLUMN public.creator_applications.terms_agreed_at IS '同意した時刻。トリガーが now() を入れるのでアプリは渡さない';

COMMENT ON COLUMN public.creator_applications.portfolio_url IS 'SNS やポートフォリオの URL（任意）';

CREATE TABLE public.creator_follows (
    follower_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_follows_check CHECK ((follower_id <> creator_id))
);

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    work_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    unit_price integer NOT NULL,
    quantity integer NOT NULL,
    creator_payout_amount integer NOT NULL,
    platform_fee_amount integer NOT NULL,
    print_cost_amount integer NOT NULL,
    stl_storage_path_snapshot text NOT NULL,
    filament_material_snapshot text NOT NULL,
    filament_color_snapshot text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid,
    size_label_snapshot text,
    print_fee_snapshot integer,
    color_slots_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    part_instructions_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);

COMMENT ON COLUMN public.order_items.color_slots_snapshot IS '注文時点の色スロット割り当て。フィラメント在庫が変わっても注文内容は動かさない。';

COMMENT ON COLUMN public.order_items.part_instructions_snapshot IS '注文時点のパーツごとの積層方向・サポート指示。運営はこれを見て造形する。';

CREATE TABLE public.shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    carrier public.shipping_carrier NOT NULL,
    service_name text,
    tracking_number text,
    box_type text,
    weight_grams integer,
    size_sum_cm integer,
    shipping_fee_jpy integer DEFAULT 0 NOT NULL,
    shipped_at timestamp with time zone DEFAULT now() NOT NULL,
    buyer_notified_at timestamp with time zone,
    packer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipments_shipping_fee_jpy_check CHECK ((shipping_fee_jpy >= 0)),
    CONSTRAINT shipments_size_sum_cm_check CHECK ((size_sum_cm >= 0)),
    CONSTRAINT shipments_weight_grams_check CHECK ((weight_grams >= 0))
);

COMMENT ON TABLE public.shipments IS '発送記録。1注文1発送（同梱前提）。追跡番号は購入者の注文詳細に出る。';

CREATE VIEW public.order_settlements WITH (security_invoker='on') AS
 WITH base AS (
         SELECT o.id AS order_id,
            o.status,
            o.created_at AS ordered_at,
            o.buyer_id,
            o.platform_fee_rate,
            o.total_amount AS gross_amount,
            o.subtotal_amount AS goods_amount,
            o.print_cost_amount AS print_fee_amount,
            o.shipping_fee_amount AS shipping_charged_amount,
            public.order_actual_print_cost(o.id) AS print_actual_amount,
            s.shipping_fee_jpy AS shipping_actual_amount,
            s.shipped_at
           FROM (public.orders o
             LEFT JOIN public.shipments s ON ((s.order_id = o.id)))
        ), used AS (
         SELECT base.order_id,
            base.status,
            base.ordered_at,
            base.buyer_id,
            base.platform_fee_rate,
            base.gross_amount,
            base.goods_amount,
            base.print_fee_amount,
            base.shipping_charged_amount,
            base.print_actual_amount,
            base.shipping_actual_amount,
            base.shipped_at,
            ((base.print_actual_amount IS NOT NULL) AND (base.shipped_at IS NOT NULL)) AS is_final,
            COALESCE(base.print_actual_amount, base.print_fee_amount) AS print_cost_used,
            COALESCE(base.shipping_actual_amount, base.shipping_charged_amount) AS shipping_used
           FROM base
        ), pooled AS (
         SELECT used.order_id,
            used.status,
            used.ordered_at,
            used.buyer_id,
            used.platform_fee_rate,
            used.gross_amount,
            used.goods_amount,
            used.print_fee_amount,
            used.shipping_charged_amount,
            used.print_actual_amount,
            used.shipping_actual_amount,
            used.shipped_at,
            used.is_final,
            used.print_cost_used,
            used.shipping_used,
            ((used.gross_amount - used.print_cost_used) - used.shipping_used) AS pool_amount
           FROM used
        )
 SELECT order_id,
    status,
    ordered_at,
    buyer_id,
    platform_fee_rate,
    gross_amount,
    goods_amount,
    print_fee_amount,
    shipping_charged_amount,
    print_actual_amount,
    shipping_actual_amount,
    shipped_at,
    is_final,
    print_cost_used,
    shipping_used,
    pool_amount,
    GREATEST((round(((pool_amount)::numeric * platform_fee_rate)))::integer, 0) AS fee_amount,
    (pool_amount - GREATEST((round(((pool_amount)::numeric * platform_fee_rate)))::integer, 0)) AS payout_amount
   FROM pooled;

COMMENT ON VIEW public.order_settlements IS '注文ごとの精算。発送済みなら実費で確定（is_final）、それまでは請求額で見込み。手数料 = (支払い − 印刷実費 − 送料実費) × 料率。';

CREATE TABLE public.work_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    storage_path text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE VIEW public.creator_item_settlements WITH (security_invoker='on') AS
 SELECT oi.id AS item_id,
    oi.order_id,
    oi.creator_id,
    oi.work_id,
    oi.variant_id,
    oi.size_label_snapshot,
    oi.quantity,
    (oi.unit_price * oi.quantity) AS goods_amount,
    oi.creator_payout_amount AS payout_estimate,
    s.status,
    s.ordered_at,
    s.shipped_at,
    s.is_final,
    amounts.fee_amount,
    amounts.payout_amount,
    w.title AS work_title,
    ( SELECT wi.storage_path
           FROM public.work_images wi
          WHERE (wi.work_id = oi.work_id)
          ORDER BY wi.sort_order
         LIMIT 1) AS thumbnail_path,
    p.display_name AS creator_name
   FROM ((((public.order_items oi
     JOIN public.order_settlements s ON ((s.order_id = oi.order_id)))
     JOIN LATERAL public.order_item_settlement_amounts(oi.order_id) amounts(item_id, fee_amount, payout_amount) ON ((amounts.item_id = oi.id)))
     LEFT JOIN public.works w ON ((w.id = oi.work_id)))
     LEFT JOIN public.profiles p ON ((p.id = oi.creator_id)));

COMMENT ON VIEW public.creator_item_settlements IS '注文単位の精算額を明細ID順の累積比率で按分。手数料・受取額の合計は注文の額と一致する。';

CREATE TABLE public.payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    amount integer NOT NULL,
    status public.payout_status DEFAULT 'requested'::public.payout_status NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT payout_requests_amount_check CHECK ((amount > 0))
);

CREATE TABLE public.revision_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision_no text,
    work_id uuid NOT NULL,
    variant_id uuid,
    creator_id uuid NOT NULL,
    inspection_id uuid,
    print_job_id uuid,
    object_id uuid,
    status public.revision_status DEFAULT 'open'::public.revision_status NOT NULL,
    cause public.reprint_cause DEFAULT 'model'::public.reprint_cause NOT NULL,
    message text NOT NULL,
    photo_paths text[] DEFAULT '{}'::text[] NOT NULL,
    due_at timestamp with time zone DEFAULT (now() + '4 days'::interval) NOT NULL,
    reprint_fee_jpy integer DEFAULT 0 NOT NULL,
    charged_to_creator boolean DEFAULT false NOT NULL,
    resolution public.revision_resolution,
    resolution_note text,
    resolved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT revision_requests_reprint_fee_jpy_check CHECK ((reprint_fee_jpy >= 0))
);

COMMENT ON TABLE public.revision_requests IS '検品NG（原因＝モデル側）からクリエイターに送られる修正依頼。対応するまで該当サイズは出品停止。';

COMMENT ON COLUMN public.revision_requests.charged_to_creator IS 'cause=model のとき true。再印刷の代行費はクリエイター負担となり、次回の売上から差し引く。';

CREATE VIEW public.creator_payout_balances WITH (security_invoker='on') AS
 WITH items AS (
         SELECT creator_item_settlements.creator_id,
            sum(creator_item_settlements.payout_amount) FILTER (WHERE (creator_item_settlements.is_final AND (creator_item_settlements.status = ANY (ARRAY['shipped'::public.order_status, 'completed'::public.order_status])))) AS settled_payout,
            sum(creator_item_settlements.payout_amount) FILTER (WHERE ((NOT (creator_item_settlements.is_final AND (creator_item_settlements.status = ANY (ARRAY['shipped'::public.order_status, 'completed'::public.order_status])))) AND (creator_item_settlements.status = ANY (ARRAY['paid'::public.order_status, 'printing_queued'::public.order_status, 'printing'::public.order_status, 'packaging'::public.order_status, 'shipped'::public.order_status, 'completed'::public.order_status])))) AS pending_payout,
            count(*) FILTER (WHERE (creator_item_settlements.status = ANY (ARRAY['paid'::public.order_status, 'printing_queued'::public.order_status, 'printing'::public.order_status, 'packaging'::public.order_status, 'shipped'::public.order_status, 'completed'::public.order_status]))) AS sold_items
           FROM public.creator_item_settlements
          GROUP BY creator_item_settlements.creator_id
        ), charges AS (
         SELECT revision_requests.creator_id,
            sum(revision_requests.reprint_fee_jpy) AS reprint_charges
           FROM public.revision_requests
          WHERE (revision_requests.charged_to_creator AND (revision_requests.status <> 'cancelled'::public.revision_status))
          GROUP BY revision_requests.creator_id
        ), requested AS (
         SELECT payout_requests.creator_id,
            sum(payout_requests.amount) FILTER (WHERE (payout_requests.status = ANY (ARRAY['requested'::public.payout_status, 'processing'::public.payout_status]))) AS requested_amount,
            sum(payout_requests.amount) FILTER (WHERE (payout_requests.status = 'paid'::public.payout_status)) AS paid_amount
           FROM public.payout_requests
          GROUP BY payout_requests.creator_id
        )
 SELECT p.id AS creator_id,
    (COALESCE(i.settled_payout, (0)::bigint))::integer AS settled_payout,
    (COALESCE(i.pending_payout, (0)::bigint))::integer AS pending_payout,
    (COALESCE(i.sold_items, (0)::bigint))::integer AS sold_items,
    (COALESCE(c.reprint_charges, (0)::bigint))::integer AS reprint_charges,
    (COALESCE(r.requested_amount, (0)::bigint))::integer AS requested_amount,
    (COALESCE(r.paid_amount, (0)::bigint))::integer AS paid_amount,
    ((((COALESCE(i.settled_payout, (0)::bigint) - COALESCE(c.reprint_charges, (0)::bigint)) - COALESCE(r.requested_amount, (0)::bigint)) - COALESCE(r.paid_amount, (0)::bigint)))::integer AS available_amount
   FROM (((public.profiles p
     LEFT JOIN items i ON ((i.creator_id = p.id)))
     LEFT JOIN charges c ON ((c.creator_id = p.id)))
     LEFT JOIN requested r ON ((r.creator_id = p.id)))
  WHERE (p.role = ANY (ARRAY['creator'::public.user_role, 'admin'::public.user_role]));

COMMENT ON VIEW public.creator_payout_balances IS 'クリエイターの受取残高。available_amount = 確定受取 − 再印刷の負担 − 申請中・処理中 − 振込済み。';

CREATE VIEW public.creator_rating_summary WITH (security_invoker='on') AS
 SELECT creator_id,
    count(*) AS review_count,
    round(avg(rating), 2) AS avg_rating,
    round(avg(design_rating), 2) AS avg_design,
    round(avg(accuracy_rating), 2) AS avg_accuracy,
    round(avg(size_fit_rating), 2) AS avg_size_fit,
    count(*) FILTER (WHERE (rating = 5)) AS five_star_count,
    max(created_at) AS last_reviewed_at
   FROM public.reviews r
  GROUP BY creator_id;

COMMENT ON VIEW public.creator_rating_summary IS 'クリエイターの公開プロフィールに出す評価。印刷・梱包・配送は運営の担当なので含めない。';

CREATE TABLE public.custom_order_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    reference_work_id uuid,
    message text NOT NULL,
    status public.custom_request_status DEFAULT 'pending'::public.custom_request_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.filament_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filament_id uuid NOT NULL,
    delta_grams numeric(9,1) NOT NULL,
    reason text NOT NULL,
    print_job_id uuid,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.filament_ledger IS 'フィラメントの増減記録。filaments.stock_grams はこの台帳の結果。';

CREATE TABLE public.filaments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material public.filament_material NOT NULL,
    color_name text NOT NULL,
    color_hex text NOT NULL,
    stock_grams integer DEFAULT 0 NOT NULL,
    price_per_gram numeric(6,2) DEFAULT 3.50 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT filaments_color_hex_check CHECK ((color_hex ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT filaments_stock_grams_check CHECK ((stock_grams >= 0))
);

COMMENT ON TABLE public.filaments IS '運営が保有するフィラメント在庫マスタ。作品の色指定はここからの選択制。';

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    body text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_favorites (
    user_id uuid NOT NULL,
    work_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.my_favorites WITH (security_invoker='on') AS
 SELECT f.user_id,
    f.created_at AS favorited_at,
    l.id,
    l.creator_id,
    l.creator_name,
    l.title,
    l.status,
    l.favorite_count,
    l.min_price_jpy,
    l.previous_min_price_jpy,
    l.price_changed_at,
    l.is_price_dropped,
    l.is_available,
    l.has_stock,
    l.review_count,
    l.avg_rating,
    l.created_at,
    ((l.min_price_jpy IS NOT NULL) AND (l.previous_min_price_jpy IS NOT NULL) AND (l.min_price_jpy < l.previous_min_price_jpy) AND (l.price_changed_at > f.created_at)) AS dropped_since_favorited
   FROM (public.work_favorites f
     JOIN public.work_list_items l ON ((l.id = f.work_id)));

COMMENT ON VIEW public.my_favorites IS 'ログイン中のユーザーのお気に入り一覧。RLS が work_favorites 側で効くので、自分の行しか返らない。';

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    kind public.notification_kind NOT NULL,
    in_app boolean DEFAULT true NOT NULL,
    email boolean DEFAULT true NOT NULL,
    push boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mandatory_kinds_stay_in_app CHECK (((kind <> ALL (ARRAY['order_shipping'::public.notification_kind, 'creator'::public.notification_kind])) OR in_app))
);

COMMENT ON TABLE public.notification_preferences IS '通知の種類ごとの受け取り方。行がない種類は「アプリ内・メールON／プッシュOFF」を既定とする。';

COMMENT ON CONSTRAINT mandatory_kinds_stay_in_app ON public.notification_preferences IS '発送・修正依頼・入金はアプリ内通知を必須にする（通知設定画面の「常時オン」に対応）。';

CREATE TABLE public.notification_settings (
    user_id uuid NOT NULL,
    email_to text,
    digest public.notification_digest DEFAULT 'instant'::public.notification_digest NOT NULL,
    digest_hour smallint DEFAULT 20 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_settings_digest_hour_check CHECK (((digest_hour >= 0) AND (digest_hour <= 23)))
);

COMMENT ON TABLE public.notification_settings IS 'メールの宛先とまとめ受信。値下げのような急がない通知が発送通知と同じ頻度で届くと読まれなくなるため。';

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind public.notification_kind NOT NULL,
    title text NOT NULL,
    body text,
    link_path text NOT NULL,
    source_table text,
    source_id uuid,
    emailed_at timestamp with time zone,
    pushed_at timestamp with time zone,
    email_claim_token uuid,
    email_claimed_until timestamp with time zone
);

COMMENT ON TABLE public.notifications IS 'アプリ内通知。行き先(link_path)が必須。作成はトリガー経由で、アプリからは既読更新だけを行う。';

COMMENT ON COLUMN public.notifications.link_path IS '通知を押したときの遷移先。行き先のない通知は作らない（サポート問い合わせになるため）。';

CREATE TABLE public.nui_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_id uuid,
    nui_id uuid NOT NULL,
    kind text NOT NULL,
    storage_path text NOT NULL,
    bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nui_assets_bytes_check CHECK ((bytes >= 0)),
    CONSTRAINT nui_assets_kind_check CHECK ((kind = ANY (ARRAY['photo'::text, 'model_glb'::text, 'cutout_png'::text, 'thumbnail'::text])))
);

COMMENT ON TABLE public.nui_assets IS '撮影写真と生成物。非公開バケット nui-scans に置く。公開プロフィールや作品ページには出さない。';

CREATE TABLE public.nui_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    kind public.nui_kind DEFAULT 'plush'::public.nui_kind NOT NULL,
    sit_height_mm numeric(7,1) NOT NULL,
    shoulder_width_mm numeric(7,1),
    hug_width_mm numeric(7,1),
    nui_size_cm numeric(4,1),
    is_main boolean DEFAULT false NOT NULL,
    has_scan boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nui_profiles_hug_width_mm_check CHECK ((hug_width_mm > (0)::numeric)),
    CONSTRAINT nui_profiles_shoulder_width_mm_check CHECK ((shoulder_width_mm > (0)::numeric)),
    CONSTRAINT nui_profiles_sit_height_mm_check CHECK ((sit_height_mm > (0)::numeric))
);

COMMENT ON TABLE public.nui_profiles IS 'ユーザーが登録したぬい。採寸値が作品との相性判定とサイズ絞り込みの基準になる。';

COMMENT ON COLUMN public.nui_profiles.has_scan IS 'アストラのスキャンが完了しているか。false の間は「うちの子で見る」が使えない。';

CREATE TABLE public.nui_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nui_id uuid,
    user_id uuid NOT NULL,
    provider text DEFAULT 'astra'::text NOT NULL,
    external_session_id text,
    shot_count integer DEFAULT 0 NOT NULL,
    status public.scan_status DEFAULT 'capturing'::public.scan_status NOT NULL,
    duration_ms integer,
    error_message text,
    measured_sit_height_mm numeric(7,1),
    measured_shoulder_width_mm numeric(7,1),
    measured_hug_width_mm numeric(7,1),
    measure_confidence numeric(4,3),
    photos_expire_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT nui_scans_duration_ms_check CHECK ((duration_ms >= 0)),
    CONSTRAINT nui_scans_measure_confidence_check CHECK (((measure_confidence >= (0)::numeric) AND (measure_confidence <= (1)::numeric))),
    CONSTRAINT nui_scans_shot_count_check CHECK ((shot_count >= 0))
);

COMMENT ON TABLE public.nui_scans IS 'アストラでの1回のスキャン。撮影枚数・生成状態・自動採寸値を持つ。写真は photos_expire_at で失効。';

COMMENT ON COLUMN public.nui_scans.measure_confidence IS '自動採寸の確からしさ。低いときに確認画面で「要確認」を出す。';

CREATE VIEW public.ops_rating_summary WITH (security_invoker='on') AS
 SELECT date_trunc('month'::text, created_at) AS month,
    count(*) FILTER (WHERE (print_quality_rating IS NOT NULL)) AS answered_count,
    round(avg(print_quality_rating), 2) AS avg_print_quality,
    round(avg(packaging_rating), 2) AS avg_packaging,
    round(avg(shipping_rating), 2) AS avg_shipping
   FROM public.reviews r
  GROUP BY (date_trunc('month'::text, created_at));

COMMENT ON VIEW public.ops_rating_summary IS '運営あて評価の月次サマリ。印刷代行の品質を運営が自分で見るためのもの。';

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    status public.order_status NOT NULL,
    note text,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payout_accounts (
    creator_id uuid NOT NULL,
    bank_name text NOT NULL,
    branch_name text NOT NULL,
    account_type text NOT NULL,
    account_number text NOT NULL,
    account_holder_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.print_job_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    print_job_id uuid NOT NULL,
    status public.print_job_status NOT NULL,
    actor_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.print_job_no_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.print_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_no text,
    order_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    variant_id uuid,
    status public.print_job_status DEFAULT 'queued'::public.print_job_status NOT NULL,
    printer_id uuid,
    assignee_id uuid,
    due_at timestamp with time zone,
    quantity integer DEFAULT 1 NOT NULL,
    part_count integer DEFAULT 1 NOT NULL,
    batch_count integer DEFAULT 1 NOT NULL,
    batch_done integer DEFAULT 0 NOT NULL,
    est_filament_grams numeric(8,1),
    est_print_hours numeric(6,2),
    print_fee_snapshot integer,
    actual_filament_grams numeric(8,1),
    actual_print_hours numeric(6,2),
    failure_count integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT print_jobs_actual_filament_grams_check CHECK ((actual_filament_grams >= (0)::numeric)),
    CONSTRAINT print_jobs_actual_print_hours_check CHECK ((actual_print_hours >= (0)::numeric)),
    CONSTRAINT print_jobs_batch_count_check CHECK ((batch_count > 0)),
    CONSTRAINT print_jobs_batch_done_check CHECK ((batch_done >= 0)),
    CONSTRAINT print_jobs_batch_done_within_count CHECK ((batch_done <= batch_count)),
    CONSTRAINT print_jobs_failure_count_check CHECK ((failure_count >= 0)),
    CONSTRAINT print_jobs_part_count_check CHECK ((part_count > 0)),
    CONSTRAINT print_jobs_quantity_check CHECK ((quantity > 0))
);

COMMENT ON TABLE public.print_jobs IS '印刷ジョブ。注文明細1件につき1件つくられ、運営の作業単位になる。';

COMMENT ON COLUMN public.print_jobs.batch_count IS 'ベッドに載りきらない場合に何回に分けて刷るか。work_variants から引き継ぐ。';

CREATE TABLE public.print_pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    material_yen_per_gram numeric(6,2) DEFAULT 3.50 NOT NULL,
    machine_yen_per_hour numeric(7,2) DEFAULT 75.00 NOT NULL,
    handling_base_yen integer DEFAULT 0 NOT NULL,
    handling_per_part_yen integer DEFAULT 20 NOT NULL,
    platform_fee_rate numeric(4,3) DEFAULT 0.100 NOT NULL,
    bed_x_mm integer DEFAULT 220 NOT NULL,
    bed_y_mm integer DEFAULT 220 NOT NULL,
    bed_z_mm integer DEFAULT 250 NOT NULL,
    max_batch_hours numeric(5,1) DEFAULT 24.0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fee_billing public.print_fee_billing DEFAULT 'separate'::public.print_fee_billing NOT NULL,
    shipping_fee_jpy integer DEFAULT 520 NOT NULL,
    CONSTRAINT print_pricing_rules_platform_fee_rate_check CHECK (((platform_fee_rate >= (0)::numeric) AND (platform_fee_rate < (1)::numeric))),
    CONSTRAINT print_pricing_rules_shipping_fee_jpy_check CHECK ((shipping_fee_jpy >= 0))
);

COMMENT ON TABLE public.print_pricing_rules IS '印刷代行費の単価とプリンタ制約。is_active の行が現在の計算に使われる。';

COMMENT ON COLUMN public.print_pricing_rules.platform_fee_rate IS '運営手数料の率。購入者の支払いから印刷代行費と送料を引いた残り（＝作品代金）にかける。既定 20%。';

COMMENT ON COLUMN public.print_pricing_rules.fee_billing IS 'separate = 購入者に印刷代行費を別建て請求（既定）。bundled = 販売価格に含める。';

COMMENT ON COLUMN public.print_pricing_rules.shipping_fee_jpy IS '購入者に請求する送料（全国一律）。決済時に orders.shipping_fee_amount へ写す。';

CREATE TABLE public.printers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    model_name text NOT NULL,
    bed_x_mm integer DEFAULT 220 NOT NULL,
    bed_y_mm integer DEFAULT 220 NOT NULL,
    bed_z_mm integer DEFAULT 250 NOT NULL,
    nozzle_mm numeric(3,2) DEFAULT 0.40 NOT NULL,
    supports_multicolor boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.printers IS '運営が保有するプリンタ。ジョブの割り当て先。';

CREATE TABLE public.work_color_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    slot_index integer NOT NULL,
    source_name text NOT NULL,
    source_hex text NOT NULL,
    face_count integer,
    filament_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_color_slots_slot_index_check CHECK ((slot_index >= 1)),
    CONSTRAINT work_color_slots_source_hex_check CHECK ((source_hex ~ '^#[0-9A-Fa-f]{6}$'::text))
);

CREATE VIEW public.print_queue WITH (security_invoker='on') AS
 SELECT j.id,
    j.job_no,
    j.status,
    j.due_at,
    ((j.due_at < now()) AND (j.status = ANY (ARRAY['queued'::public.print_job_status, 'printing'::public.print_job_status, 'reprinting'::public.print_job_status]))) AS is_overdue,
    j.order_id,
    o.created_at AS ordered_at,
    o.buyer_id,
    buyer.display_name AS buyer_name,
    o.gift_wrapping,
    w.id AS work_id,
    w.title AS work_title,
    img.storage_path AS thumbnail_path,
    v.id AS variant_id,
    v.size_label,
    v.nui_size_cm,
    j.quantity,
    f.material,
    f.color_name,
    f.color_hex,
    j.est_filament_grams,
    j.est_print_hours,
    j.actual_filament_grams,
    j.actual_print_hours,
    j.failure_count,
    j.part_count,
    j.batch_count,
    j.batch_done,
    j.printer_id,
    p.code AS printer_code,
    j.assignee_id,
    pr.display_name AS assignee_name,
    j.created_at
   FROM ((((((((public.print_jobs j
     JOIN public.orders o ON ((o.id = j.order_id)))
     JOIN public.profiles buyer ON ((buyer.id = o.buyer_id)))
     LEFT JOIN public.work_variants v ON ((v.id = j.variant_id)))
     LEFT JOIN public.works w ON ((w.id = v.work_id)))
     LEFT JOIN public.printers p ON ((p.id = j.printer_id)))
     LEFT JOIN public.profiles pr ON ((pr.id = j.assignee_id)))
     LEFT JOIN LATERAL ( SELECT wi.storage_path
           FROM public.work_images wi
          WHERE (wi.work_id = w.id)
          ORDER BY wi.sort_order
         LIMIT 1) img ON (true))
     LEFT JOIN LATERAL ( SELECT fl.material,
            fl.color_name,
            fl.color_hex
           FROM (public.work_color_slots cs
             JOIN public.filaments fl ON ((fl.id = cs.filament_id)))
          WHERE (cs.work_id = w.id)
          ORDER BY cs.slot_index
         LIMIT 1) f ON (true));

COMMENT ON VIEW public.print_queue IS '運営の印刷キュー画面が読む一覧。素材・色は代表スロット（slot_index が最小）を表示する。';

CREATE TABLE public.qc_check_definitions (
    code text NOT NULL,
    label text NOT NULL,
    description text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.qc_check_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inspection_id uuid NOT NULL,
    code text NOT NULL,
    passed boolean NOT NULL,
    note text
);

COMMENT ON TABLE public.qc_check_results IS '検品チェック項目ごとの合否。どの項目で落ちやすいかの集計に使う。';

CREATE TABLE public.qc_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    print_job_id uuid NOT NULL,
    inspector_id uuid,
    result public.qc_result NOT NULL,
    memo text,
    photo_paths text[] DEFAULT '{}'::text[] NOT NULL,
    reprint_cause public.reprint_cause,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qc_failed_requires_cause CHECK (((result = 'passed'::public.qc_result) OR (reprint_cause IS NOT NULL)))
);

COMMENT ON TABLE public.qc_inspections IS '検品記録。1ジョブに複数回（再印刷のたびに）積み上がる。';

COMMENT ON COLUMN public.qc_inspections.reprint_cause IS 'model を選ぶと再印刷の代行費は運営負担にならず、クリエイターに修正依頼が飛ぶ。';

CREATE TABLE public.qna_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    asker_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.quote_no_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.revision_no_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.tag_type NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.tryon_renders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nui_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    view text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tryon_renders_view_check CHECK ((view = ANY (ARRAY['front'::text, 'angle'::text, 'side'::text, 'scale'::text])))
);

COMMENT ON TABLE public.tryon_renders IS '（ぬい × バリアント × 視点）の合成結果。同じ組み合わせを毎回生成しないためのキャッシュ。';

CREATE TABLE public.user_nui_sizes (
    user_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.variants_missing_fit_dims WITH (security_invoker='on') AS
 SELECT v.id AS variant_id,
    v.work_id,
    w.title,
    w.creator_id,
    v.size_label,
    v.is_listed
   FROM (public.work_variants v
     JOIN public.works w ON ((w.id = v.work_id)))
  WHERE ((v.fit_width_mm IS NULL) OR (v.fit_height_mm IS NULL) OR (v.fit_depth_mm IS NULL));

COMMENT ON VIEW public.variants_missing_fit_dims IS '内寸が未入力のバリアント。ここが埋まらないと「うちの子で見る」の判定が出せない。';

CREATE TABLE public.work_assembly (
    work_id uuid NOT NULL,
    diagram_storage_path text,
    fit_clearance_mm numeric(4,2),
    adhesive text,
    steps_text text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_asset_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    object_index integer NOT NULL,
    name text NOT NULL,
    triangle_count integer,
    bbox_x_mm numeric(8,2) NOT NULL,
    bbox_y_mm numeric(8,2) NOT NULL,
    bbox_z_mm numeric(8,2) NOT NULL,
    volume_cm3 numeric(10,2) NOT NULL,
    surface_area_cm2 numeric(10,2),
    is_manifold boolean DEFAULT true NOT NULL,
    open_edge_count integer DEFAULT 0 NOT NULL,
    flipped_normal_count integer DEFAULT 0 NOT NULL,
    self_intersection_count integer DEFAULT 0 NOT NULL,
    min_wall_thickness_mm numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_format public.model_file_format NOT NULL,
    file_size_bytes bigint NOT NULL,
    unit text DEFAULT 'mm'::text NOT NULL,
    object_count integer DEFAULT 1 NOT NULL,
    triangle_count integer,
    vertex_count integer,
    total_volume_cm3 numeric(10,2),
    total_surface_area_cm2 numeric(10,2),
    bbox_x_mm numeric(8,2),
    bbox_y_mm numeric(8,2),
    bbox_z_mm numeric(8,2),
    validation_status public.validation_status DEFAULT 'pending'::public.validation_status NOT NULL,
    validated_at timestamp with time zone,
    is_primary boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_assets_file_size_bytes_check CHECK ((file_size_bytes > 0)),
    CONSTRAINT work_assets_object_count_check CHECK ((object_count > 0))
);

COMMENT ON COLUMN public.work_assets.is_primary IS 'サイズ展開の基準になるデータ。1作品につき1つ。';

CREATE TABLE public.work_part_instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    object_id uuid NOT NULL,
    variant_id uuid,
    orientation public.print_orientation DEFAULT 'flat'::public.print_orientation NOT NULL,
    no_rotate boolean DEFAULT false NOT NULL,
    support public.support_mode DEFAULT 'none'::public.support_mode NOT NULL,
    support_note text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.work_part_instructions.no_rotate IS '寝かせた状態でデータ化されている等、運営が向きを変えてはいけない場合に true。';

CREATE TABLE public.work_tags (
    work_id uuid NOT NULL,
    tag_id uuid NOT NULL
);

CREATE TABLE public.work_validation_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    object_id uuid,
    code text NOT NULL,
    severity public.issue_severity NOT NULL,
    message text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.work_variant_pricing WITH (security_invoker='on') AS
 SELECT v.id,
    v.work_id,
    v.size_label,
    v.nui_size_cm,
    v.scale_ratio,
    v.is_base,
    v.bbox_x_mm,
    v.bbox_y_mm,
    v.bbox_z_mm,
    v.max_part_bbox_x_mm,
    v.max_part_bbox_y_mm,
    v.max_part_bbox_z_mm,
    v.oversized_parts,
    v.est_filament_grams,
    v.est_print_hours,
    v.part_count,
    v.batch_count,
    v.print_fee_jpy,
    v.price_jpy,
    v.stock,
    v.is_listed,
    v.is_printable,
    v.unprintable_reason,
    r.fee_billing,
        CASE
            WHEN (r.fee_billing = 'bundled'::public.print_fee_billing) THEN (ceil(((v.print_fee_jpy)::numeric / ((1)::numeric - r.platform_fee_rate))))::integer
            ELSE 100
        END AS min_price_jpy,
        CASE
            WHEN (v.price_jpy IS NULL) THEN NULL::integer
            WHEN (r.fee_billing = 'separate'::public.print_fee_billing) THEN (v.price_jpy + v.print_fee_jpy)
            ELSE v.price_jpy
        END AS buyer_total_jpy,
        CASE
            WHEN (v.price_jpy IS NULL) THEN NULL::integer
            WHEN (r.fee_billing = 'separate'::public.print_fee_billing) THEN (v.price_jpy - (round(((v.price_jpy)::numeric * r.platform_fee_rate)))::integer)
            ELSE ((v.price_jpy - v.print_fee_jpy) - (round(((v.price_jpy)::numeric * r.platform_fee_rate)))::integer)
        END AS creator_payout_jpy
   FROM (public.work_variants v
     CROSS JOIN LATERAL ( SELECT print_pricing_rules.id,
            print_pricing_rules.effective_from,
            print_pricing_rules.material_yen_per_gram,
            print_pricing_rules.machine_yen_per_hour,
            print_pricing_rules.handling_base_yen,
            print_pricing_rules.handling_per_part_yen,
            print_pricing_rules.platform_fee_rate,
            print_pricing_rules.bed_x_mm,
            print_pricing_rules.bed_y_mm,
            print_pricing_rules.bed_z_mm,
            print_pricing_rules.max_batch_hours,
            print_pricing_rules.is_active,
            print_pricing_rules.created_at,
            print_pricing_rules.fee_billing
           FROM public.print_pricing_rules
          WHERE print_pricing_rules.is_active
         LIMIT 1) r);

COMMENT ON VIEW public.work_variant_pricing IS 'サイズ展開に価格下限・購入者総額・クリエイター受取額を付与したビュー。ベッド判定は最大パーツ寸法で行う。';

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_variant_id_key UNIQUE (cart_id, variant_id);

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.coordinate_post_pins
    ADD CONSTRAINT coordinate_post_pins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.coordinate_posts
    ADD CONSTRAINT coordinate_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.creator_follows
    ADD CONSTRAINT creator_follows_pkey PRIMARY KEY (follower_id, creator_id);

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_quote_no_key UNIQUE (quote_no);

ALTER TABLE ONLY public.custom_order_requests
    ADD CONSTRAINT custom_order_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.filament_ledger
    ADD CONSTRAINT filament_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.filaments
    ADD CONSTRAINT filaments_material_color_name_key UNIQUE (material, color_name);

ALTER TABLE ONLY public.filaments
    ADD CONSTRAINT filaments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, kind);

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.nui_assets
    ADD CONSTRAINT nui_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.nui_profiles
    ADD CONSTRAINT nui_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.nui_scans
    ADD CONSTRAINT nui_scans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_checkout_request_key UNIQUE (buyer_id, checkout_request_id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);

ALTER TABLE ONLY public.payout_accounts
    ADD CONSTRAINT payout_accounts_pkey PRIMARY KEY (creator_id);

ALTER TABLE ONLY public.payout_requests
    ADD CONSTRAINT payout_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.print_job_events
    ADD CONSTRAINT print_job_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_job_no_key UNIQUE (job_no);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.print_pricing_rules
    ADD CONSTRAINT print_pricing_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_code_key UNIQUE (code);

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.qc_check_definitions
    ADD CONSTRAINT qc_check_definitions_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.qc_check_results
    ADD CONSTRAINT qc_check_results_inspection_id_code_key UNIQUE (inspection_id, code);

ALTER TABLE ONLY public.qc_check_results
    ADD CONSTRAINT qc_check_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.qc_inspections
    ADD CONSTRAINT qc_inspections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.qna_threads
    ADD CONSTRAINT qna_threads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_item_id_key UNIQUE (order_item_id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_revision_no_key UNIQUE (revision_no);

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_type_slug_key UNIQUE (type, slug);

ALTER TABLE ONLY public.tryon_renders
    ADD CONSTRAINT tryon_renders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_nui_sizes
    ADD CONSTRAINT user_nui_sizes_pkey PRIMARY KEY (user_id, tag_id);

ALTER TABLE ONLY public.work_assembly
    ADD CONSTRAINT work_assembly_pkey PRIMARY KEY (work_id);

ALTER TABLE ONLY public.work_asset_objects
    ADD CONSTRAINT work_asset_objects_asset_id_object_index_key UNIQUE (asset_id, object_index);

ALTER TABLE ONLY public.work_asset_objects
    ADD CONSTRAINT work_asset_objects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_assets
    ADD CONSTRAINT work_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_color_slots
    ADD CONSTRAINT work_color_slots_asset_id_slot_index_key UNIQUE (asset_id, slot_index);

ALTER TABLE ONLY public.work_color_slots
    ADD CONSTRAINT work_color_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_favorites
    ADD CONSTRAINT work_favorites_pkey PRIMARY KEY (user_id, work_id);

ALTER TABLE ONLY public.work_images
    ADD CONSTRAINT work_images_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_part_instructions
    ADD CONSTRAINT work_part_instructions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_tags
    ADD CONSTRAINT work_tags_pkey PRIMARY KEY (work_id, tag_id);

ALTER TABLE ONLY public.work_validation_issues
    ADD CONSTRAINT work_validation_issues_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_variants
    ADD CONSTRAINT work_variants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.work_variants
    ADD CONSTRAINT work_variants_work_id_size_label_key UNIQUE (work_id, size_label);

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_pkey PRIMARY KEY (id);

CREATE INDEX addresses_user_id_idx ON public.addresses USING btree (user_id);

CREATE INDEX coordinate_post_pins_post_id_idx ON public.coordinate_post_pins USING btree (post_id);

CREATE INDEX coordinate_posts_user_id_idx ON public.coordinate_posts USING btree (user_id);

CREATE UNIQUE INDEX creator_applications_one_pending_per_user ON public.creator_applications USING btree (user_id) WHERE (status = 'pending'::public.creator_application_status);

CREATE INDEX creator_applications_status_idx ON public.creator_applications USING btree (status);

CREATE INDEX creator_applications_user_id_idx ON public.creator_applications USING btree (user_id);

CREATE INDEX custom_order_quotes_buyer_idx ON public.custom_order_quotes USING btree (buyer_id, status);

CREATE INDEX custom_order_quotes_creator_idx ON public.custom_order_quotes USING btree (creator_id, status);

CREATE UNIQUE INDEX custom_order_quotes_one_open_idx ON public.custom_order_quotes USING btree (request_id) WHERE (status = ANY (ARRAY['sent'::public.quote_status, 'accepted'::public.quote_status]));

CREATE INDEX custom_order_quotes_request_idx ON public.custom_order_quotes USING btree (request_id);

CREATE INDEX filament_ledger_filament_idx ON public.filament_ledger USING btree (filament_id, created_at DESC);

CREATE INDEX filaments_active_idx ON public.filaments USING btree (is_active) WHERE is_active;

CREATE INDEX messages_order_id_idx ON public.messages USING btree (order_id);

CREATE INDEX messages_recipient_id_idx ON public.messages USING btree (recipient_id);

CREATE INDEX notifications_email_pending_idx ON public.notifications USING btree (created_at) WHERE (emailed_at IS NULL);

CREATE UNIQUE INDEX notifications_source_uniq ON public.notifications USING btree (user_id, source_table, source_id, kind) WHERE (source_id IS NOT NULL);

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);

CREATE INDEX notifications_user_kind_idx ON public.notifications USING btree (user_id, kind, created_at DESC);

CREATE INDEX nui_assets_nui_idx ON public.nui_assets USING btree (nui_id, kind);

CREATE UNIQUE INDEX nui_profiles_one_main_idx ON public.nui_profiles USING btree (user_id) WHERE is_main;

CREATE INDEX nui_profiles_user_idx ON public.nui_profiles USING btree (user_id, created_at DESC);

CREATE INDEX nui_scans_nui_idx ON public.nui_scans USING btree (nui_id, created_at DESC);

CREATE INDEX nui_scans_user_idx ON public.nui_scans USING btree (user_id, created_at DESC);

CREATE INDEX order_items_creator_id_idx ON public.order_items USING btree (creator_id);

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);

CREATE INDEX order_status_history_order_id_idx ON public.order_status_history USING btree (order_id);

CREATE INDEX orders_buyer_id_idx ON public.orders USING btree (buyer_id);

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE INDEX payout_requests_creator_id_idx ON public.payout_requests USING btree (creator_id);

CREATE INDEX print_job_events_job_idx ON public.print_job_events USING btree (print_job_id, created_at);

CREATE INDEX print_jobs_order_id_idx ON public.print_jobs USING btree (order_id);

CREATE UNIQUE INDEX print_jobs_order_item_idx ON public.print_jobs USING btree (order_item_id);

CREATE INDEX print_jobs_overdue_idx ON public.print_jobs USING btree (due_at) WHERE (status = ANY (ARRAY['queued'::public.print_job_status, 'printing'::public.print_job_status, 'reprinting'::public.print_job_status]));

CREATE INDEX print_jobs_printer_idx ON public.print_jobs USING btree (printer_id) WHERE (printer_id IS NOT NULL);

CREATE INDEX print_jobs_status_due_idx ON public.print_jobs USING btree (status, due_at);

CREATE UNIQUE INDEX print_pricing_rules_single_active_idx ON public.print_pricing_rules USING btree (is_active) WHERE is_active;

CREATE INDEX printers_active_idx ON public.printers USING btree (is_active) WHERE is_active;

CREATE INDEX qc_inspections_job_idx ON public.qc_inspections USING btree (print_job_id, created_at DESC);

CREATE INDEX qna_threads_work_id_idx ON public.qna_threads USING btree (work_id);

CREATE INDEX reviews_work_id_idx ON public.reviews USING btree (work_id);

CREATE INDEX revision_requests_creator_idx ON public.revision_requests USING btree (creator_id, status);

CREATE INDEX revision_requests_due_idx ON public.revision_requests USING btree (due_at) WHERE (status = 'open'::public.revision_status);

CREATE INDEX revision_requests_work_idx ON public.revision_requests USING btree (work_id);

CREATE UNIQUE INDEX shipments_order_idx ON public.shipments USING btree (order_id);

CREATE INDEX shipments_tracking_idx ON public.shipments USING btree (tracking_number) WHERE (tracking_number IS NOT NULL);

CREATE UNIQUE INDEX tryon_renders_uniq ON public.tryon_renders USING btree (nui_id, variant_id, view);

CREATE INDEX work_asset_objects_asset_id_idx ON public.work_asset_objects USING btree (asset_id);

CREATE UNIQUE INDEX work_assets_one_primary_idx ON public.work_assets USING btree (work_id) WHERE is_primary;

CREATE INDEX work_assets_work_id_idx ON public.work_assets USING btree (work_id);

CREATE INDEX work_color_slots_work_id_idx ON public.work_color_slots USING btree (work_id);

CREATE INDEX work_favorites_user_created_idx ON public.work_favorites USING btree (user_id, created_at DESC);

CREATE INDEX work_images_work_id_idx ON public.work_images USING btree (work_id);

CREATE UNIQUE INDEX work_part_instructions_unique_idx ON public.work_part_instructions USING btree (object_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX work_part_instructions_work_id_idx ON public.work_part_instructions USING btree (work_id);

CREATE INDEX work_tags_tag_id_idx ON public.work_tags USING btree (tag_id);

CREATE INDEX work_validation_issues_asset_id_idx ON public.work_validation_issues USING btree (asset_id);

CREATE INDEX work_variants_listed_idx ON public.work_variants USING btree (is_listed) WHERE is_listed;

CREATE INDEX work_variants_nui_size_idx ON public.work_variants USING btree (nui_size_cm);

CREATE UNIQUE INDEX work_variants_one_base_idx ON public.work_variants USING btree (work_id) WHERE is_base;

CREATE INDEX work_variants_work_id_idx ON public.work_variants USING btree (work_id);

CREATE INDEX works_creator_id_idx ON public.works USING btree (creator_id);

CREATE INDEX works_favorite_rank_idx ON public.works USING btree (favorite_count DESC, created_at DESC) WHERE (status = 'published'::public.work_status);

CREATE INDEX works_status_idx ON public.works USING btree (status);

CREATE TRIGGER creator_applications_notify_review AFTER UPDATE ON public.creator_applications FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.notify_on_creator_application_review();

CREATE TRIGGER custom_order_quotes_assign_no BEFORE INSERT OR UPDATE ON public.custom_order_quotes FOR EACH ROW EXECUTE FUNCTION public.assign_quote_no();

CREATE TRIGGER custom_order_quotes_notify AFTER INSERT OR UPDATE OF status ON public.custom_order_quotes FOR EACH ROW EXECUTE FUNCTION public.notify_on_quote_sent();

CREATE TRIGGER filament_ledger_apply AFTER INSERT ON public.filament_ledger FOR EACH ROW EXECUTE FUNCTION public.apply_filament_ledger();

CREATE TRIGGER guard_creator_application_insert BEFORE INSERT ON public.creator_applications FOR EACH ROW EXECUTE FUNCTION public.guard_creator_application_insert();

CREATE TRIGGER guard_profile_role BEFORE UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

CREATE TRIGGER messages_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

CREATE TRIGGER nui_profiles_first_is_main AFTER INSERT ON public.nui_profiles FOR EACH ROW EXECUTE FUNCTION public.set_first_nui_as_main();

CREATE TRIGGER nui_profiles_sync_size BEFORE INSERT OR UPDATE OF sit_height_mm ON public.nui_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_nui_size();

CREATE TRIGGER nui_scans_apply_ready AFTER UPDATE OF status ON public.nui_scans FOR EACH ROW EXECUTE FUNCTION public.apply_scan_ready();

CREATE TRIGGER on_creator_application_status_change BEFORE UPDATE ON public.creator_applications FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.handle_creator_application_approval();

CREATE TRIGGER orders_notify_sale AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_on_sale();

CREATE TRIGGER orders_snapshot_fee_rate BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_fee_rate();

CREATE TRIGGER payout_requests_check BEFORE INSERT ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.check_payout_request();

CREATE TRIGGER payout_requests_notify AFTER UPDATE OF status ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.notify_on_payout();

CREATE TRIGGER print_jobs_assign_no BEFORE INSERT ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.assign_print_job_no();

CREATE TRIGGER print_jobs_notify_start AFTER UPDATE OF status ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.notify_on_print_start();

CREATE TRIGGER print_jobs_record_event AFTER INSERT OR UPDATE ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.record_print_job_event();

CREATE TRIGGER print_jobs_sync_order AFTER INSERT OR UPDATE OF status ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.sync_order_from_jobs();

CREATE TRIGGER print_jobs_touch BEFORE UPDATE ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_print_job();

CREATE TRIGGER qc_inspections_apply AFTER INSERT ON public.qc_inspections FOR EACH ROW EXECUTE FUNCTION public.apply_qc_result();

CREATE TRIGGER qc_inspections_create_revision AFTER INSERT ON public.qc_inspections FOR EACH ROW EXECUTE FUNCTION public.create_revision_from_qc();

CREATE TRIGGER qna_threads_notify_answer AFTER UPDATE OF answer ON public.qna_threads FOR EACH ROW EXECUTE FUNCTION public.notify_on_answer();

CREATE TRIGGER qna_threads_notify_question AFTER INSERT ON public.qna_threads FOR EACH ROW EXECUTE FUNCTION public.notify_on_question();

CREATE TRIGGER reviews_notify AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.notify_on_review();

CREATE TRIGGER revision_requests_apply_listing AFTER INSERT OR UPDATE OF status ON public.revision_requests FOR EACH ROW EXECUTE FUNCTION public.apply_revision_listing();

CREATE TRIGGER revision_requests_assign_no BEFORE INSERT OR UPDATE ON public.revision_requests FOR EACH ROW EXECUTE FUNCTION public.assign_revision_no();

CREATE TRIGGER revision_requests_notify AFTER INSERT ON public.revision_requests FOR EACH ROW EXECUTE FUNCTION public.notify_on_revision();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payout_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER shipments_apply AFTER INSERT ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.apply_shipment();

CREATE TRIGGER shipments_notify AFTER INSERT ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.notify_on_shipment();

CREATE TRIGGER sync_work_variant_before_write BEFORE INSERT OR UPDATE ON public.work_variants FOR EACH ROW EXECUTE FUNCTION public.sync_work_variant();

CREATE TRIGGER work_favorites_sync_count AFTER INSERT OR DELETE ON public.work_favorites FOR EACH ROW EXECUTE FUNCTION public.sync_work_favorite_count();

CREATE TRIGGER work_variants_invalidate_tryon AFTER UPDATE ON public.work_variants FOR EACH ROW EXECUTE FUNCTION public.invalidate_tryon_renders();

CREATE TRIGGER work_variants_scale_fit BEFORE INSERT OR UPDATE OF scale_ratio ON public.work_variants FOR EACH ROW EXECUTE FUNCTION public.scale_fit_dims();

CREATE TRIGGER work_variants_sync_min_price AFTER INSERT OR DELETE OR UPDATE OF price_jpy, is_listed ON public.work_variants FOR EACH ROW EXECUTE FUNCTION public.sync_work_min_price();

CREATE TRIGGER works_notify_price_drop AFTER UPDATE OF min_price_jpy ON public.works FOR EACH ROW EXECUTE FUNCTION public.notify_on_price_drop();

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.coordinate_post_pins
    ADD CONSTRAINT coordinate_post_pins_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.coordinate_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.coordinate_post_pins
    ADD CONSTRAINT coordinate_post_pins_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.coordinate_posts
    ADD CONSTRAINT coordinate_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.creator_follows
    ADD CONSTRAINT creator_follows_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.creator_follows
    ADD CONSTRAINT creator_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.work_assets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_base_work_id_fkey FOREIGN KEY (base_work_id) REFERENCES public.works(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.custom_order_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.custom_order_quotes
    ADD CONSTRAINT custom_order_quotes_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.custom_order_requests
    ADD CONSTRAINT custom_order_requests_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.custom_order_requests
    ADD CONSTRAINT custom_order_requests_reference_work_id_fkey FOREIGN KEY (reference_work_id) REFERENCES public.works(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.custom_order_requests
    ADD CONSTRAINT custom_order_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.filament_ledger
    ADD CONSTRAINT filament_ledger_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.filament_ledger
    ADD CONSTRAINT filament_ledger_filament_id_fkey FOREIGN KEY (filament_id) REFERENCES public.filaments(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.filament_ledger
    ADD CONSTRAINT filament_ledger_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nui_assets
    ADD CONSTRAINT nui_assets_nui_id_fkey FOREIGN KEY (nui_id) REFERENCES public.nui_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nui_assets
    ADD CONSTRAINT nui_assets_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.nui_scans(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nui_profiles
    ADD CONSTRAINT nui_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nui_scans
    ADD CONSTRAINT nui_scans_nui_id_fkey FOREIGN KEY (nui_id) REFERENCES public.nui_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nui_scans
    ADD CONSTRAINT nui_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES public.addresses(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payout_accounts
    ADD CONSTRAINT payout_accounts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payout_requests
    ADD CONSTRAINT payout_requests_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.print_job_events
    ADD CONSTRAINT print_job_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.print_job_events
    ADD CONSTRAINT print_job_events_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.app_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.qc_check_results
    ADD CONSTRAINT qc_check_results_code_fkey FOREIGN KEY (code) REFERENCES public.qc_check_definitions(code) ON DELETE RESTRICT;

ALTER TABLE ONLY public.qc_check_results
    ADD CONSTRAINT qc_check_results_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.qc_inspections(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.qc_inspections
    ADD CONSTRAINT qc_inspections_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.qc_inspections
    ADD CONSTRAINT qc_inspections_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.qna_threads
    ADD CONSTRAINT qna_threads_asker_id_fkey FOREIGN KEY (asker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.qna_threads
    ADD CONSTRAINT qna_threads_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.qc_inspections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.work_asset_objects(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.revision_requests
    ADD CONSTRAINT revision_requests_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_packer_id_fkey FOREIGN KEY (packer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tryon_renders
    ADD CONSTRAINT tryon_renders_nui_id_fkey FOREIGN KEY (nui_id) REFERENCES public.nui_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tryon_renders
    ADD CONSTRAINT tryon_renders_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_nui_sizes
    ADD CONSTRAINT user_nui_sizes_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_nui_sizes
    ADD CONSTRAINT user_nui_sizes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_assembly
    ADD CONSTRAINT work_assembly_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_asset_objects
    ADD CONSTRAINT work_asset_objects_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.work_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_assets
    ADD CONSTRAINT work_assets_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_color_slots
    ADD CONSTRAINT work_color_slots_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.work_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_color_slots
    ADD CONSTRAINT work_color_slots_filament_id_fkey FOREIGN KEY (filament_id) REFERENCES public.filaments(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.work_color_slots
    ADD CONSTRAINT work_color_slots_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_favorites
    ADD CONSTRAINT work_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_favorites
    ADD CONSTRAINT work_favorites_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_images
    ADD CONSTRAINT work_images_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_part_instructions
    ADD CONSTRAINT work_part_instructions_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.work_asset_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_part_instructions
    ADD CONSTRAINT work_part_instructions_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.work_variants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_part_instructions
    ADD CONSTRAINT work_part_instructions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_tags
    ADD CONSTRAINT work_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_tags
    ADD CONSTRAINT work_tags_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_validation_issues
    ADD CONSTRAINT work_validation_issues_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.work_assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_validation_issues
    ADD CONSTRAINT work_validation_issues_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.work_asset_objects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.work_variants
    ADD CONSTRAINT work_variants_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.work_assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.work_variants
    ADD CONSTRAINT work_variants_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assembly for owner and admin" ON public.work_assembly USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_assembly.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_assembly.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "asset objects follow asset" ON public.work_asset_objects FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.work_assets a
     JOIN public.works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_asset_objects.asset_id) AND ((w.status = 'published'::public.work_status) OR (w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "asset objects writable by owner" ON public.work_asset_objects USING ((EXISTS ( SELECT 1
   FROM (public.work_assets a
     JOIN public.works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_asset_objects.asset_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.work_assets a
     JOIN public.works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_asset_objects.asset_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "buyers create reviews for own purchases" ON public.reviews FOR INSERT WITH CHECK (((app.user_id() = reviewer_id) AND (EXISTS ( SELECT 1
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.id = reviews.order_item_id) AND (o.buyer_id = app.user_id()) AND (o.status = 'completed'::public.order_status))))));

CREATE POLICY "buyers submit creator applications" ON public.creator_applications FOR INSERT WITH CHECK (((app.user_id() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = app.user_id()) AND (p.role = 'buyer'::public.user_role))))));

CREATE POLICY "buyers view own order items" ON public.order_items FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = app.user_id())))) OR (creator_id = app.user_id()) OR public.is_admin()));

CREATE POLICY "buyers view own orders" ON public.orders FOR SELECT USING (((app.user_id() = buyer_id) OR public.is_admin()));

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "color slots readable when work is published" ON public.work_color_slots FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_color_slots.work_id) AND ((w.status = 'published'::public.work_status) OR (w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "color slots writable by owner" ON public.work_color_slots USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_color_slots.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_color_slots.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "coordinate pins are publicly viewable" ON public.coordinate_post_pins FOR SELECT USING (true);

CREATE POLICY "coordinate posts are publicly viewable" ON public.coordinate_posts FOR SELECT USING (true);

ALTER TABLE public.coordinate_post_pins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coordinate_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.creator_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators answer own work questions" ON public.qna_threads FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = qna_threads.work_id) AND (w.creator_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = qna_threads.work_id) AND (w.creator_id = app.user_id())))));

CREATE POLICY "creators delete own works" ON public.works FOR DELETE USING ((creator_id = app.user_id()));

CREATE POLICY "creators insert own works" ON public.works FOR INSERT WITH CHECK ((creator_id = app.user_id()));

CREATE POLICY "creators manage own payout account" ON public.payout_accounts USING ((app.user_id() = creator_id)) WITH CHECK ((app.user_id() = creator_id));

CREATE POLICY "creators manage own payout requests" ON public.payout_requests USING (((app.user_id() = creator_id) OR public.is_admin())) WITH CHECK ((app.user_id() = creator_id));

CREATE POLICY "creators manage own work images" ON public.work_images USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_images.work_id) AND (w.creator_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_images.work_id) AND (w.creator_id = app.user_id())))));

CREATE POLICY "creators manage own work tags" ON public.work_tags USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_tags.work_id) AND (w.creator_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_tags.work_id) AND (w.creator_id = app.user_id())))));

CREATE POLICY "creators respond to custom requests" ON public.custom_order_requests FOR UPDATE USING (((app.user_id() = creator_id) OR (app.user_id() = requester_id))) WITH CHECK (((app.user_id() = creator_id) OR (app.user_id() = requester_id)));

CREATE POLICY "creators update own works" ON public.works FOR UPDATE USING ((creator_id = app.user_id())) WITH CHECK ((creator_id = app.user_id()));

CREATE POLICY "creators view orders containing their items" ON public.orders FOR SELECT USING (public.order_has_creator_items(id, app.user_id()));

ALTER TABLE public.custom_order_quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.custom_order_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filament ledger admin only" ON public.filament_ledger USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.filament_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.filaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filaments are readable by everyone" ON public.filaments FOR SELECT USING (true);

CREATE POLICY "filaments are writable by admin" ON public.filaments USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "follows are publicly viewable" ON public.creator_follows FOR SELECT USING (true);

CREATE POLICY "listed variants are readable by everyone" ON public.work_variants FOR SELECT USING ((is_listed OR (EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_variants.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_own ON public.notification_preferences USING ((user_id = app.user_id())) WITH CHECK ((user_id = app.user_id()));

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_settings_own ON public.notification_settings USING ((user_id = app.user_id())) WITH CHECK ((user_id = app.user_id()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING ((user_id = app.user_id()));

ALTER TABLE public.nui_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nui_assets_own ON public.nui_assets USING ((EXISTS ( SELECT 1
   FROM public.nui_profiles p
  WHERE ((p.id = nui_assets.nui_id) AND (p.user_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.nui_profiles p
  WHERE ((p.id = nui_assets.nui_id) AND (p.user_id = app.user_id())))));

ALTER TABLE public.nui_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY nui_profiles_own ON public.nui_profiles USING ((user_id = app.user_id())) WITH CHECK ((user_id = app.user_id()));

ALTER TABLE public.nui_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY nui_scans_own ON public.nui_scans USING ((user_id = app.user_id())) WITH CHECK ((user_id = app.user_id()));

CREATE POLICY "only admin manages tags" ON public.tags USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "only admin updates applications" ON public.creator_applications FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "order status history visible to participants" ON public.order_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_history.order_id) AND ((o.buyer_id = app.user_id()) OR public.is_admin())))));

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part instructions for owner and admin" ON public.work_part_instructions USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_part_instructions.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_part_instructions.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "participants view custom requests" ON public.custom_order_requests FOR SELECT USING (((app.user_id() = requester_id) OR (app.user_id() = creator_id)));

CREATE POLICY "participants view own messages" ON public.messages FOR SELECT USING (((app.user_id() = sender_id) OR (app.user_id() = recipient_id)));

CREATE POLICY "payout accounts readable by admin" ON public.payout_accounts FOR SELECT USING (public.is_admin());

CREATE POLICY "payout requests processed by admin" ON public.payout_requests FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing rules are readable by everyone" ON public.print_pricing_rules FOR SELECT USING (true);

CREATE POLICY "pricing rules are writable by admin" ON public.print_pricing_rules USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "print job events readable by owner or admin" ON public.print_job_events FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.print_jobs j
     JOIN public.orders o ON ((o.id = j.order_id)))
  WHERE ((j.id = print_job_events.print_job_id) AND (o.buyer_id = app.user_id()))))));

CREATE POLICY "print job events writable by admin" ON public.print_job_events USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "print jobs readable by owner or admin" ON public.print_jobs FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = print_jobs.order_id) AND (o.buyer_id = app.user_id()))))));

CREATE POLICY "print jobs readable by work creator" ON public.print_jobs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.work_variants v
     JOIN public.works w ON ((w.id = v.work_id)))
  WHERE ((v.id = print_jobs.variant_id) AND (w.creator_id = app.user_id())))));

CREATE POLICY "print jobs writable by admin" ON public.print_jobs USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.print_job_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.print_pricing_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "printers admin only" ON public.printers USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles are publicly viewable" ON public.profiles FOR SELECT USING (true);

CREATE POLICY "published works are publicly viewable" ON public.works FOR SELECT USING (((status = 'published'::public.work_status) OR (creator_id = app.user_id()) OR public.is_admin()));

CREATE POLICY "qc check results admin only" ON public.qc_check_results USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "qc check results readable via own revision" ON public.qc_check_results FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.revision_requests r
  WHERE ((r.inspection_id = qc_check_results.inspection_id) AND (r.creator_id = app.user_id())))));

CREATE POLICY "qc definitions readable" ON public.qc_check_definitions FOR SELECT USING (true);

CREATE POLICY "qc definitions writable by admin" ON public.qc_check_definitions USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "qc inspections admin only" ON public.qc_inspections USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "qc inspections readable via own revision" ON public.qc_inspections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.revision_requests r
  WHERE ((r.inspection_id = qc_inspections.id) AND (r.creator_id = app.user_id())))));

ALTER TABLE public.qc_check_definitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qc_check_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qna is publicly viewable" ON public.qna_threads FOR SELECT USING (true);

ALTER TABLE public.qna_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes readable by参加者" ON public.custom_order_quotes FOR SELECT USING ((public.is_admin() OR (buyer_id = app.user_id()) OR (creator_id = app.user_id())));

CREATE POLICY "quotes writable by creator" ON public.custom_order_quotes USING ((public.is_admin() OR (creator_id = app.user_id()))) WITH CHECK ((public.is_admin() OR (creator_id = app.user_id())));

CREATE POLICY "recipients mark messages read" ON public.messages FOR UPDATE USING ((app.user_id() = recipient_id)) WITH CHECK ((app.user_id() = recipient_id));

CREATE POLICY "requesters create custom requests" ON public.custom_order_requests FOR INSERT WITH CHECK ((app.user_id() = requester_id));

CREATE POLICY "reserved variants readable by their buyer" ON public.work_variants FOR SELECT USING (public.variant_reserved_for(id, app.user_id()));

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews are publicly viewable" ON public.reviews FOR SELECT USING (true);

ALTER TABLE public.revision_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revisions created by admin" ON public.revision_requests FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "revisions deleted by admin" ON public.revision_requests FOR DELETE USING (public.is_admin());

CREATE POLICY "revisions readable by creator or admin" ON public.revision_requests FOR SELECT USING ((public.is_admin() OR (creator_id = app.user_id())));

CREATE POLICY "revisions updated by creator or admin" ON public.revision_requests FOR UPDATE USING ((public.is_admin() OR (creator_id = app.user_id()))) WITH CHECK ((public.is_admin() OR (creator_id = app.user_id())));

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipments readable by item creator" ON public.shipments FOR SELECT USING (public.order_has_creator_items(order_id, app.user_id()));

CREATE POLICY "shipments readable by owner or admin" ON public.shipments FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = shipments.order_id) AND (o.buyer_id = app.user_id()))))));

CREATE POLICY "shipments writable by admin" ON public.shipments USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "shipping addresses readable by admin" ON public.addresses FOR SELECT USING ((public.is_admin() AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE (o.shipping_address_id = addresses.id)))));

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags are publicly viewable" ON public.tags FOR SELECT USING (true);

ALTER TABLE public.tryon_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tryon_renders_own ON public.tryon_renders USING ((EXISTS ( SELECT 1
   FROM public.nui_profiles p
  WHERE ((p.id = tryon_renders.nui_id) AND (p.user_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.nui_profiles p
  WHERE ((p.id = tryon_renders.nui_id) AND (p.user_id = app.user_id())))));

ALTER TABLE public.user_nui_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users ask questions" ON public.qna_threads FOR INSERT WITH CHECK ((app.user_id() = asker_id));

CREATE POLICY "users can update own profile" ON public.profiles FOR UPDATE USING ((app.user_id() = id)) WITH CHECK ((app.user_id() = id));

CREATE POLICY "users delete own coordinate posts" ON public.coordinate_posts FOR DELETE USING ((app.user_id() = user_id));

CREATE POLICY "users manage own addresses" ON public.addresses USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users manage own cart" ON public.carts USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users manage own cart items" ON public.cart_items USING ((EXISTS ( SELECT 1
   FROM public.carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = app.user_id())))));

CREATE POLICY "users manage own coordinate posts" ON public.coordinate_posts FOR INSERT WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users manage own favorites" ON public.work_favorites USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users manage own follows" ON public.creator_follows USING ((app.user_id() = follower_id)) WITH CHECK ((app.user_id() = follower_id));

CREATE POLICY "users manage own nui sizes" ON public.user_nui_sizes USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users manage pins on own posts" ON public.coordinate_post_pins USING ((EXISTS ( SELECT 1
   FROM public.coordinate_posts p
  WHERE ((p.id = coordinate_post_pins.post_id) AND (p.user_id = app.user_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.coordinate_posts p
  WHERE ((p.id = coordinate_post_pins.post_id) AND (p.user_id = app.user_id())))));

CREATE POLICY "users send messages" ON public.messages FOR INSERT WITH CHECK ((app.user_id() = sender_id));

CREATE POLICY "users update own coordinate posts" ON public.coordinate_posts FOR UPDATE USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE USING ((app.user_id() = user_id)) WITH CHECK ((app.user_id() = user_id));

CREATE POLICY "users view own applications" ON public.creator_applications FOR SELECT USING (((app.user_id() = user_id) OR public.is_admin()));

CREATE POLICY "users view own notifications" ON public.notifications FOR SELECT USING ((app.user_id() = user_id));

CREATE POLICY "validation issues for owner and admin" ON public.work_validation_issues USING ((EXISTS ( SELECT 1
   FROM (public.work_assets a
     JOIN public.works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_validation_issues.asset_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.work_assets a
     JOIN public.works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_validation_issues.asset_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "variants writable by owner" ON public.work_variants USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_variants.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_variants.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "work assets readable when work is published" ON public.work_assets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_assets.work_id) AND ((w.status = 'published'::public.work_status) OR (w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "work assets writable by owner" ON public.work_assets USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_assets.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_assets.work_id) AND ((w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "work images follow work visibility" ON public.work_images FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_images.work_id) AND ((w.status = 'published'::public.work_status) OR (w.creator_id = app.user_id()) OR public.is_admin())))));

CREATE POLICY "work tags follow work visibility" ON public.work_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.works w
  WHERE ((w.id = work_tags.work_id) AND ((w.status = 'published'::public.work_status) OR (w.creator_id = app.user_id()) OR public.is_admin())))));

ALTER TABLE public.work_assembly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_asset_objects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_color_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_favorites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_images ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_part_instructions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_validation_issues ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_variants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works with reserved variants readable by their buyer" ON public.works FOR SELECT USING (public.work_reserved_for(id, app.user_id()));

GRANT USAGE ON SCHEMA public TO app_guest;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO app_service;

REVOKE ALL ON FUNCTION public.accept_custom_quote(p_quote_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_custom_quote(p_quote_id uuid) TO app_user;

GRANT ALL ON FUNCTION public.apply_filament_ledger() TO app_guest;
GRANT ALL ON FUNCTION public.apply_filament_ledger() TO app_user;
GRANT ALL ON FUNCTION public.apply_filament_ledger() TO app_service;

GRANT ALL ON FUNCTION public.apply_qc_result() TO app_guest;
GRANT ALL ON FUNCTION public.apply_qc_result() TO app_user;
GRANT ALL ON FUNCTION public.apply_qc_result() TO app_service;

GRANT ALL ON FUNCTION public.apply_revision_listing() TO app_guest;
GRANT ALL ON FUNCTION public.apply_revision_listing() TO app_user;
GRANT ALL ON FUNCTION public.apply_revision_listing() TO app_service;

GRANT ALL ON FUNCTION public.apply_scan_ready() TO app_guest;
GRANT ALL ON FUNCTION public.apply_scan_ready() TO app_user;
GRANT ALL ON FUNCTION public.apply_scan_ready() TO app_service;

GRANT ALL ON FUNCTION public.apply_shipment() TO app_guest;
GRANT ALL ON FUNCTION public.apply_shipment() TO app_user;
GRANT ALL ON FUNCTION public.apply_shipment() TO app_service;

REVOKE ALL ON FUNCTION public.apply_stripe_checkout(p_order_id uuid, p_session_id text, p_amount_total integer, p_currency text, p_paid boolean, p_payment_ref text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.assign_print_job_no() TO app_guest;
GRANT ALL ON FUNCTION public.assign_print_job_no() TO app_user;
GRANT ALL ON FUNCTION public.assign_print_job_no() TO app_service;

GRANT ALL ON FUNCTION public.assign_quote_no() TO app_guest;
GRANT ALL ON FUNCTION public.assign_quote_no() TO app_user;
GRANT ALL ON FUNCTION public.assign_quote_no() TO app_service;

GRANT ALL ON FUNCTION public.assign_revision_no() TO app_guest;
GRANT ALL ON FUNCTION public.assign_revision_no() TO app_user;
GRANT ALL ON FUNCTION public.assign_revision_no() TO app_service;

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.orders TO app_guest;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.orders TO app_user;
GRANT ALL ON TABLE public.orders TO app_service;

REVOKE ALL ON FUNCTION public.begin_order_checkout(p_order_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.calc_print_fee(grams numeric, hours numeric, parts integer) TO app_guest;
GRANT ALL ON FUNCTION public.calc_print_fee(grams numeric, hours numeric, parts integer) TO app_user;
GRANT ALL ON FUNCTION public.calc_print_fee(grams numeric, hours numeric, parts integer) TO app_service;

REVOKE ALL ON FUNCTION public.cancel_unpaid_order(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_unpaid_order(p_order_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.cancel_unpaid_order(p_order_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.check_payout_request() TO app_guest;
GRANT ALL ON FUNCTION public.check_payout_request() TO app_user;
GRANT ALL ON FUNCTION public.check_payout_request() TO app_service;

REVOKE ALL ON FUNCTION public.claim_notification_emails(p_claim_token uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_notification_emails(p_claim_token uuid, p_limit integer) TO app_service;

REVOKE ALL ON FUNCTION public.confirm_demo_order(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_demo_order(p_order_id uuid) TO app_user;

REVOKE ALL ON FUNCTION public.confirm_order_payment(p_order_id uuid, p_payment_ref text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_order_payment(p_order_id uuid, p_payment_ref text) TO app_service;

GRANT ALL ON FUNCTION public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer) TO app_guest;
GRANT ALL ON FUNCTION public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer) TO app_user;
GRANT ALL ON FUNCTION public.create_print_jobs_for_order(p_order_id uuid, p_lead_days integer) TO app_service;

GRANT ALL ON FUNCTION public.create_revision_from_qc() TO app_guest;
GRANT ALL ON FUNCTION public.create_revision_from_qc() TO app_user;
GRANT ALL ON FUNCTION public.create_revision_from_qc() TO app_service;

GRANT ALL ON TABLE public.work_variants TO app_guest;
GRANT ALL ON TABLE public.work_variants TO app_user;
GRANT ALL ON TABLE public.work_variants TO app_service;

GRANT ALL ON FUNCTION public.creator_payout_for(variant public.work_variants) TO app_guest;
GRANT ALL ON FUNCTION public.creator_payout_for(variant public.work_variants) TO app_user;
GRANT ALL ON FUNCTION public.creator_payout_for(variant public.work_variants) TO app_service;

GRANT ALL ON FUNCTION public.creator_public_stats(p_creator_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.creator_public_stats(p_creator_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.creator_public_stats(p_creator_id uuid) TO app_service;

REVOKE ALL ON FUNCTION public.decline_custom_quote(p_quote_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decline_custom_quote(p_quote_id uuid) TO app_user;

GRANT ALL ON FUNCTION public.estimate_filament_grams(surface_area_cm2 numeric, volume_cm3 numeric, shell_cm numeric, infill numeric, density numeric) TO app_guest;
GRANT ALL ON FUNCTION public.estimate_filament_grams(surface_area_cm2 numeric, volume_cm3 numeric, shell_cm numeric, infill numeric, density numeric) TO app_user;
GRANT ALL ON FUNCTION public.estimate_filament_grams(surface_area_cm2 numeric, volume_cm3 numeric, shell_cm numeric, infill numeric, density numeric) TO app_service;

REVOKE ALL ON FUNCTION public.expire_custom_quotes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_custom_quotes() TO app_service;

GRANT ALL ON FUNCTION public.grant_admin(p_email text) TO app_guest;
GRANT ALL ON FUNCTION public.grant_admin(p_email text) TO app_user;
GRANT ALL ON FUNCTION public.grant_admin(p_email text) TO app_service;

GRANT ALL ON FUNCTION public.guard_creator_application_insert() TO app_guest;
GRANT ALL ON FUNCTION public.guard_creator_application_insert() TO app_user;
GRANT ALL ON FUNCTION public.guard_creator_application_insert() TO app_service;

GRANT ALL ON FUNCTION public.guard_profile_role() TO app_guest;
GRANT ALL ON FUNCTION public.guard_profile_role() TO app_user;
GRANT ALL ON FUNCTION public.guard_profile_role() TO app_service;

GRANT ALL ON FUNCTION public.handle_creator_application_approval() TO app_guest;
GRANT ALL ON FUNCTION public.handle_creator_application_approval() TO app_user;
GRANT ALL ON FUNCTION public.handle_creator_application_approval() TO app_service;

GRANT ALL ON FUNCTION public.handle_new_user() TO app_guest;
GRANT ALL ON FUNCTION public.handle_new_user() TO app_user;
GRANT ALL ON FUNCTION public.handle_new_user() TO app_service;

GRANT ALL ON FUNCTION public.invalidate_tryon_renders() TO app_guest;
GRANT ALL ON FUNCTION public.invalidate_tryon_renders() TO app_user;
GRANT ALL ON FUNCTION public.invalidate_tryon_renders() TO app_service;

GRANT ALL ON FUNCTION public.is_admin() TO app_guest;
GRANT ALL ON FUNCTION public.is_admin() TO app_user;
GRANT ALL ON FUNCTION public.is_admin() TO app_service;

GRANT ALL ON FUNCTION public.judge_axis(p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric) TO app_guest;
GRANT ALL ON FUNCTION public.judge_axis(p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric) TO app_user;
GRANT ALL ON FUNCTION public.judge_axis(p_slot_mm numeric, p_nui_mm numeric, p_loose_mm numeric) TO app_service;

GRANT ALL ON FUNCTION public.list_admin_members() TO app_guest;
GRANT ALL ON FUNCTION public.list_admin_members() TO app_user;
GRANT ALL ON FUNCTION public.list_admin_members() TO app_service;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_all_notifications_read() TO app_user;

REVOKE ALL ON FUNCTION public.notification_email_targets(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notification_email_targets(p_limit integer) TO app_service;

GRANT ALL ON FUNCTION public.notify_on_answer() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_answer() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_answer() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_creator_application_review() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_creator_application_review() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_creator_application_review() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_message() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_message() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_message() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_payout() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_payout() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_payout() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_price_drop() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_price_drop() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_price_drop() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_print_start() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_print_start() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_print_start() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_question() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_question() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_question() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_quote_sent() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_quote_sent() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_quote_sent() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_review() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_review() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_review() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_revision() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_revision() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_revision() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_sale() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_sale() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_sale() TO app_service;

GRANT ALL ON FUNCTION public.notify_on_shipment() TO app_guest;
GRANT ALL ON FUNCTION public.notify_on_shipment() TO app_user;
GRANT ALL ON FUNCTION public.notify_on_shipment() TO app_service;

GRANT ALL ON FUNCTION public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.nui_fit_for_work(p_work_id uuid, p_nui_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.nui_fit_verdict(p_variant_id uuid, p_nui_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.nui_fit_verdict(p_variant_id uuid, p_nui_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.nui_fit_verdict(p_variant_id uuid, p_nui_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.order_actual_print_cost(p_order_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.order_actual_print_cost(p_order_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.order_actual_print_cost(p_order_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.order_has_creator_items(p_order_id uuid, p_creator_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.order_has_creator_items(p_order_id uuid, p_creator_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.order_has_creator_items(p_order_id uuid, p_creator_id uuid) TO app_service;

REVOKE ALL ON FUNCTION public.order_item_settlement_amounts(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.order_item_settlement_amounts(p_order_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.order_item_settlement_amounts(p_order_id uuid) TO app_service;

REVOKE ALL ON FUNCTION public.place_demo_order(p_address_id uuid, p_request_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.place_demo_order(p_address_id uuid, p_request_id uuid, p_note text) TO app_user;

REVOKE ALL ON FUNCTION public.place_order(p_address_id uuid, p_note text) FROM PUBLIC;

GRANT ALL ON TABLE public.profiles TO app_guest;
GRANT ALL ON TABLE public.profiles TO app_user;
GRANT ALL ON TABLE public.profiles TO app_service;

GRANT ALL ON TABLE public.reviews TO app_guest;
GRANT ALL ON TABLE public.reviews TO app_user;
GRANT ALL ON TABLE public.reviews TO app_service;

GRANT ALL ON TABLE public.works TO app_guest;
GRANT ALL ON TABLE public.works TO app_user;
GRANT ALL ON TABLE public.works TO app_service;

GRANT ALL ON TABLE public.work_list_items TO app_guest;
GRANT ALL ON TABLE public.work_list_items TO app_user;
GRANT ALL ON TABLE public.work_list_items TO app_service;

GRANT ALL ON FUNCTION public.popular_works(p_limit integer, p_offset integer, p_nui_size_cm numeric) TO app_guest;
GRANT ALL ON FUNCTION public.popular_works(p_limit integer, p_offset integer, p_nui_size_cm numeric) TO app_user;
GRANT ALL ON FUNCTION public.popular_works(p_limit integer, p_offset integer, p_nui_size_cm numeric) TO app_service;

REVOKE ALL ON FUNCTION public.purge_old_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_old_notifications() TO app_service;

REVOKE ALL ON FUNCTION public.push_notification(p_user_id uuid, p_kind public.notification_kind, p_title text, p_body text, p_link_path text, p_source_table text, p_source_id uuid) FROM PUBLIC;

GRANT ALL ON TABLE public.custom_order_quotes TO app_guest;
GRANT ALL ON TABLE public.custom_order_quotes TO app_user;
GRANT ALL ON TABLE public.custom_order_quotes TO app_service;

GRANT ALL ON FUNCTION public.quote_total_jpy(q public.custom_order_quotes) TO app_guest;
GRANT ALL ON FUNCTION public.quote_total_jpy(q public.custom_order_quotes) TO app_user;
GRANT ALL ON FUNCTION public.quote_total_jpy(q public.custom_order_quotes) TO app_service;

GRANT ALL ON FUNCTION public.record_print_job_event() TO app_guest;
GRANT ALL ON FUNCTION public.record_print_job_event() TO app_user;
GRANT ALL ON FUNCTION public.record_print_job_event() TO app_service;

GRANT ALL ON FUNCTION public.revoke_admin(p_user_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.revoke_admin(p_user_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.revoke_admin(p_user_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.scale_fit_dims() TO app_guest;
GRANT ALL ON FUNCTION public.scale_fit_dims() TO app_user;
GRANT ALL ON FUNCTION public.scale_fit_dims() TO app_service;

GRANT ALL ON FUNCTION public.set_first_nui_as_main() TO app_guest;
GRANT ALL ON FUNCTION public.set_first_nui_as_main() TO app_user;
GRANT ALL ON FUNCTION public.set_first_nui_as_main() TO app_service;

GRANT ALL ON FUNCTION public.set_updated_at() TO app_guest;
GRANT ALL ON FUNCTION public.set_updated_at() TO app_user;
GRANT ALL ON FUNCTION public.set_updated_at() TO app_service;

GRANT ALL ON FUNCTION public.snapshot_order_fee_rate() TO app_guest;
GRANT ALL ON FUNCTION public.snapshot_order_fee_rate() TO app_user;
GRANT ALL ON FUNCTION public.snapshot_order_fee_rate() TO app_service;

GRANT ALL ON FUNCTION public.sync_nui_size() TO app_guest;
GRANT ALL ON FUNCTION public.sync_nui_size() TO app_user;
GRANT ALL ON FUNCTION public.sync_nui_size() TO app_service;

GRANT ALL ON FUNCTION public.sync_order_from_jobs() TO app_guest;
GRANT ALL ON FUNCTION public.sync_order_from_jobs() TO app_user;
GRANT ALL ON FUNCTION public.sync_order_from_jobs() TO app_service;

GRANT ALL ON FUNCTION public.sync_work_favorite_count() TO app_guest;
GRANT ALL ON FUNCTION public.sync_work_favorite_count() TO app_user;
GRANT ALL ON FUNCTION public.sync_work_favorite_count() TO app_service;

GRANT ALL ON FUNCTION public.sync_work_min_price() TO app_guest;
GRANT ALL ON FUNCTION public.sync_work_min_price() TO app_user;
GRANT ALL ON FUNCTION public.sync_work_min_price() TO app_service;

GRANT ALL ON FUNCTION public.sync_work_variant() TO app_guest;
GRANT ALL ON FUNCTION public.sync_work_variant() TO app_user;
GRANT ALL ON FUNCTION public.sync_work_variant() TO app_service;

GRANT ALL ON FUNCTION public.touch_print_job() TO app_guest;
GRANT ALL ON FUNCTION public.touch_print_job() TO app_user;
GRANT ALL ON FUNCTION public.touch_print_job() TO app_service;

GRANT ALL ON FUNCTION public.unread_notification_count() TO app_guest;
GRANT ALL ON FUNCTION public.unread_notification_count() TO app_user;
GRANT ALL ON FUNCTION public.unread_notification_count() TO app_service;

GRANT ALL ON FUNCTION public.variant_reserved_for(p_variant_id uuid, p_user_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.variant_reserved_for(p_variant_id uuid, p_user_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.variant_reserved_for(p_variant_id uuid, p_user_id uuid) TO app_service;

GRANT ALL ON FUNCTION public.work_reserved_for(p_work_id uuid, p_user_id uuid) TO app_guest;
GRANT ALL ON FUNCTION public.work_reserved_for(p_work_id uuid, p_user_id uuid) TO app_user;
GRANT ALL ON FUNCTION public.work_reserved_for(p_work_id uuid, p_user_id uuid) TO app_service;

GRANT ALL ON TABLE public.addresses TO app_guest;
GRANT ALL ON TABLE public.addresses TO app_user;
GRANT ALL ON TABLE public.addresses TO app_service;

GRANT ALL ON TABLE public.cart_items TO app_guest;
GRANT ALL ON TABLE public.cart_items TO app_user;
GRANT ALL ON TABLE public.cart_items TO app_service;

GRANT ALL ON TABLE public.carts TO app_guest;
GRANT ALL ON TABLE public.carts TO app_user;
GRANT ALL ON TABLE public.carts TO app_service;

GRANT ALL ON TABLE public.coordinate_post_pins TO app_guest;
GRANT ALL ON TABLE public.coordinate_post_pins TO app_user;
GRANT ALL ON TABLE public.coordinate_post_pins TO app_service;

GRANT ALL ON TABLE public.coordinate_posts TO app_guest;
GRANT ALL ON TABLE public.coordinate_posts TO app_user;
GRANT ALL ON TABLE public.coordinate_posts TO app_service;

GRANT ALL ON TABLE public.creator_applications TO app_guest;
GRANT ALL ON TABLE public.creator_applications TO app_user;
GRANT ALL ON TABLE public.creator_applications TO app_service;

GRANT ALL ON TABLE public.creator_follows TO app_guest;
GRANT ALL ON TABLE public.creator_follows TO app_user;
GRANT ALL ON TABLE public.creator_follows TO app_service;

GRANT ALL ON TABLE public.order_items TO app_guest;
GRANT ALL ON TABLE public.order_items TO app_user;
GRANT ALL ON TABLE public.order_items TO app_service;

GRANT ALL ON TABLE public.shipments TO app_guest;
GRANT ALL ON TABLE public.shipments TO app_user;
GRANT ALL ON TABLE public.shipments TO app_service;

GRANT ALL ON TABLE public.order_settlements TO app_guest;
GRANT ALL ON TABLE public.order_settlements TO app_user;
GRANT ALL ON TABLE public.order_settlements TO app_service;

GRANT ALL ON TABLE public.work_images TO app_guest;
GRANT ALL ON TABLE public.work_images TO app_user;
GRANT ALL ON TABLE public.work_images TO app_service;

GRANT ALL ON TABLE public.creator_item_settlements TO app_guest;
GRANT ALL ON TABLE public.creator_item_settlements TO app_user;
GRANT ALL ON TABLE public.creator_item_settlements TO app_service;

GRANT ALL ON TABLE public.payout_requests TO app_guest;
GRANT ALL ON TABLE public.payout_requests TO app_user;
GRANT ALL ON TABLE public.payout_requests TO app_service;

GRANT ALL ON TABLE public.revision_requests TO app_guest;
GRANT ALL ON TABLE public.revision_requests TO app_user;
GRANT ALL ON TABLE public.revision_requests TO app_service;

GRANT ALL ON TABLE public.creator_payout_balances TO app_guest;
GRANT ALL ON TABLE public.creator_payout_balances TO app_user;
GRANT ALL ON TABLE public.creator_payout_balances TO app_service;

GRANT ALL ON TABLE public.creator_rating_summary TO app_guest;
GRANT ALL ON TABLE public.creator_rating_summary TO app_user;
GRANT ALL ON TABLE public.creator_rating_summary TO app_service;

GRANT ALL ON TABLE public.custom_order_requests TO app_guest;
GRANT ALL ON TABLE public.custom_order_requests TO app_user;
GRANT ALL ON TABLE public.custom_order_requests TO app_service;

GRANT ALL ON TABLE public.filament_ledger TO app_guest;
GRANT ALL ON TABLE public.filament_ledger TO app_user;
GRANT ALL ON TABLE public.filament_ledger TO app_service;

GRANT ALL ON TABLE public.filaments TO app_guest;
GRANT ALL ON TABLE public.filaments TO app_user;
GRANT ALL ON TABLE public.filaments TO app_service;

GRANT ALL ON TABLE public.messages TO app_guest;
GRANT ALL ON TABLE public.messages TO app_user;
GRANT ALL ON TABLE public.messages TO app_service;

GRANT ALL ON TABLE public.work_favorites TO app_guest;
GRANT ALL ON TABLE public.work_favorites TO app_user;
GRANT ALL ON TABLE public.work_favorites TO app_service;

GRANT ALL ON TABLE public.my_favorites TO app_guest;
GRANT ALL ON TABLE public.my_favorites TO app_user;
GRANT ALL ON TABLE public.my_favorites TO app_service;

GRANT ALL ON TABLE public.notification_preferences TO app_guest;
GRANT ALL ON TABLE public.notification_preferences TO app_user;
GRANT ALL ON TABLE public.notification_preferences TO app_service;

GRANT ALL ON TABLE public.notification_settings TO app_guest;
GRANT ALL ON TABLE public.notification_settings TO app_user;
GRANT ALL ON TABLE public.notification_settings TO app_service;

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO app_guest;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO app_user;
GRANT ALL ON TABLE public.notifications TO app_service;

GRANT UPDATE(read_at) ON TABLE public.notifications TO app_user;

GRANT ALL ON TABLE public.nui_assets TO app_guest;
GRANT ALL ON TABLE public.nui_assets TO app_user;
GRANT ALL ON TABLE public.nui_assets TO app_service;

GRANT ALL ON TABLE public.nui_profiles TO app_guest;
GRANT ALL ON TABLE public.nui_profiles TO app_user;
GRANT ALL ON TABLE public.nui_profiles TO app_service;

GRANT ALL ON TABLE public.nui_scans TO app_guest;
GRANT ALL ON TABLE public.nui_scans TO app_user;
GRANT ALL ON TABLE public.nui_scans TO app_service;

GRANT ALL ON TABLE public.ops_rating_summary TO app_guest;
GRANT ALL ON TABLE public.ops_rating_summary TO app_user;
GRANT ALL ON TABLE public.ops_rating_summary TO app_service;

GRANT ALL ON TABLE public.order_status_history TO app_guest;
GRANT ALL ON TABLE public.order_status_history TO app_user;
GRANT ALL ON TABLE public.order_status_history TO app_service;

GRANT ALL ON TABLE public.payout_accounts TO app_guest;
GRANT ALL ON TABLE public.payout_accounts TO app_user;
GRANT ALL ON TABLE public.payout_accounts TO app_service;

GRANT ALL ON TABLE public.print_job_events TO app_guest;
GRANT ALL ON TABLE public.print_job_events TO app_user;
GRANT ALL ON TABLE public.print_job_events TO app_service;

GRANT ALL ON SEQUENCE public.print_job_no_seq TO app_guest;
GRANT ALL ON SEQUENCE public.print_job_no_seq TO app_user;
GRANT ALL ON SEQUENCE public.print_job_no_seq TO app_service;

GRANT ALL ON TABLE public.print_jobs TO app_guest;
GRANT ALL ON TABLE public.print_jobs TO app_user;
GRANT ALL ON TABLE public.print_jobs TO app_service;

GRANT ALL ON TABLE public.print_pricing_rules TO app_guest;
GRANT ALL ON TABLE public.print_pricing_rules TO app_user;
GRANT ALL ON TABLE public.print_pricing_rules TO app_service;

GRANT ALL ON TABLE public.printers TO app_guest;
GRANT ALL ON TABLE public.printers TO app_user;
GRANT ALL ON TABLE public.printers TO app_service;

GRANT ALL ON TABLE public.work_color_slots TO app_guest;
GRANT ALL ON TABLE public.work_color_slots TO app_user;
GRANT ALL ON TABLE public.work_color_slots TO app_service;

GRANT ALL ON TABLE public.print_queue TO app_guest;
GRANT ALL ON TABLE public.print_queue TO app_user;
GRANT ALL ON TABLE public.print_queue TO app_service;

GRANT ALL ON TABLE public.qc_check_definitions TO app_guest;
GRANT ALL ON TABLE public.qc_check_definitions TO app_user;
GRANT ALL ON TABLE public.qc_check_definitions TO app_service;

GRANT ALL ON TABLE public.qc_check_results TO app_guest;
GRANT ALL ON TABLE public.qc_check_results TO app_user;
GRANT ALL ON TABLE public.qc_check_results TO app_service;

GRANT ALL ON TABLE public.qc_inspections TO app_guest;
GRANT ALL ON TABLE public.qc_inspections TO app_user;
GRANT ALL ON TABLE public.qc_inspections TO app_service;

GRANT ALL ON TABLE public.qna_threads TO app_guest;
GRANT ALL ON TABLE public.qna_threads TO app_user;
GRANT ALL ON TABLE public.qna_threads TO app_service;

GRANT ALL ON SEQUENCE public.quote_no_seq TO app_guest;
GRANT ALL ON SEQUENCE public.quote_no_seq TO app_user;
GRANT ALL ON SEQUENCE public.quote_no_seq TO app_service;

GRANT ALL ON SEQUENCE public.revision_no_seq TO app_guest;
GRANT ALL ON SEQUENCE public.revision_no_seq TO app_user;
GRANT ALL ON SEQUENCE public.revision_no_seq TO app_service;

GRANT ALL ON TABLE public.tags TO app_guest;
GRANT ALL ON TABLE public.tags TO app_user;
GRANT ALL ON TABLE public.tags TO app_service;

GRANT ALL ON TABLE public.tryon_renders TO app_guest;
GRANT ALL ON TABLE public.tryon_renders TO app_user;
GRANT ALL ON TABLE public.tryon_renders TO app_service;

GRANT ALL ON TABLE public.user_nui_sizes TO app_guest;
GRANT ALL ON TABLE public.user_nui_sizes TO app_user;
GRANT ALL ON TABLE public.user_nui_sizes TO app_service;

GRANT ALL ON TABLE public.variants_missing_fit_dims TO app_guest;
GRANT ALL ON TABLE public.variants_missing_fit_dims TO app_user;
GRANT ALL ON TABLE public.variants_missing_fit_dims TO app_service;

GRANT ALL ON TABLE public.work_assembly TO app_guest;
GRANT ALL ON TABLE public.work_assembly TO app_user;
GRANT ALL ON TABLE public.work_assembly TO app_service;

GRANT ALL ON TABLE public.work_asset_objects TO app_guest;
GRANT ALL ON TABLE public.work_asset_objects TO app_user;
GRANT ALL ON TABLE public.work_asset_objects TO app_service;

GRANT ALL ON TABLE public.work_assets TO app_guest;
GRANT ALL ON TABLE public.work_assets TO app_user;
GRANT ALL ON TABLE public.work_assets TO app_service;

GRANT ALL ON TABLE public.work_part_instructions TO app_guest;
GRANT ALL ON TABLE public.work_part_instructions TO app_user;
GRANT ALL ON TABLE public.work_part_instructions TO app_service;

GRANT ALL ON TABLE public.work_tags TO app_guest;
GRANT ALL ON TABLE public.work_tags TO app_user;
GRANT ALL ON TABLE public.work_tags TO app_service;

GRANT ALL ON TABLE public.work_validation_issues TO app_guest;
GRANT ALL ON TABLE public.work_validation_issues TO app_user;
GRANT ALL ON TABLE public.work_validation_issues TO app_service;

GRANT ALL ON TABLE public.work_variant_pricing TO app_guest;
GRANT ALL ON TABLE public.work_variant_pricing TO app_user;
GRANT ALL ON TABLE public.work_variant_pricing TO app_service;

--

-- The application roles have no BYPASSRLS privilege (also works on RDS).
-- Trusted jobs explicitly reserve a connection as app_service.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('create policy background_service on public.%I to app_service using (true) with check (true)', t.tablename);
  end loop;
end $$;
create trigger on_app_user_created after insert on public.app_users
  for each row execute function public.handle_new_user();
reset search_path;
reset row_security;
reset check_function_bodies;

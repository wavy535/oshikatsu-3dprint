-- =============================================================================
-- 0014_admin_console.sql
--
-- 運営コンソール（印刷キュー → ジョブ詳細 → 検品・発送登録）を成立させるための
-- 4点。スキーマ 0006/0008 の器はそろっていたが、画面から使うと足りないものが
-- 出てきたので、その差分だけを埋める。
--
--   1. 運営が発送作業のために配送先を読めるようにする
--   2. print_queue ビューに一覧が要る列（作品ID・サムネ・購入者・数量など）を足す
--   3. 検品写真の置き場（qc-photos バケット）
--   4. 検品待ちの注文が「印刷待ち」に見えていた注文ステータスの導出を直す
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 配送先：運営は「注文に使われた住所」だけ読める
--
--   addresses のポリシーは本人限定（users manage own addresses）だけだった。
--   このままだと検品・発送登録の画面にお届け先が出せない。
--   住所全体を運営に開けるのではなく、注文の宛先になっているものに限る。
-- -----------------------------------------------------------------------------
create policy "shipping addresses readable by admin"
  on public.addresses for select
  using (
    public.is_admin()
    and exists (select 1 from public.orders o where o.shipping_address_id = addresses.id)
  );

-- -----------------------------------------------------------------------------
-- 2. 印刷キューのビューを画面に合わせる
--
--   0006 の print_queue には work_id も variant_id も無く、サムネイルも購入者も
--   引けなかった（一覧の行から作品にたどれない）。列を足して作り直す。
--   security_invoker は 0011 の方針どおり明示的に付け直す。
-- -----------------------------------------------------------------------------
drop view if exists public.print_queue;

create view public.print_queue as
select
  j.id,
  j.job_no,
  j.status,
  j.due_at,
  (j.due_at < now() and j.status in ('queued', 'printing', 'reprinting')) as is_overdue,
  j.order_id,
  o.created_at as ordered_at,
  o.buyer_id,
  buyer.display_name as buyer_name,
  o.gift_wrapping,
  w.id as work_id,
  w.title as work_title,
  img.storage_path as thumbnail_path,
  v.id as variant_id,
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
  p.code as printer_code,
  j.assignee_id,
  pr.display_name as assignee_name,
  j.created_at
from public.print_jobs j
join public.orders o on o.id = j.order_id
join public.profiles buyer on buyer.id = o.buyer_id
left join public.work_variants v on v.id = j.variant_id
left join public.works w on w.id = v.work_id
left join public.printers p on p.id = j.printer_id
left join public.profiles pr on pr.id = j.assignee_id
left join lateral (
  select wi.storage_path
    from public.work_images wi
   where wi.work_id = w.id
   order by wi.sort_order
   limit 1
) img on true
left join lateral (
  select fl.material, fl.color_name, fl.color_hex
    from public.work_color_slots cs
    join public.filaments fl on fl.id = cs.filament_id
   where cs.work_id = w.id
   order by cs.slot_index
   limit 1
) f on true;

alter view public.print_queue set (security_invoker = on);

comment on view public.print_queue is
  '運営の印刷キュー画面が読む一覧。素材・色は代表スロット（slot_index が最小）を表示する。';

-- -----------------------------------------------------------------------------
-- 3. 検品写真のバケット
--
--   qc_inspections.photo_paths / revision_requests.photo_paths の置き場が
--   無かった。検品NG（モデル側）はこの写真がそのまま修正依頼に渡るので、
--   クリエイターは自分の作品ぶんだけ読める必要がある。
--   パス規約: {work_id}/{print_job_id}/{filename}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('qc-photos', 'qc-photos', false)
on conflict (id) do nothing;

create policy "admin manage qc photos"
  on storage.objects for all
  using (bucket_id = 'qc-photos' and public.is_admin())
  with check (bucket_id = 'qc-photos' and public.is_admin());

create policy "creators read qc photos of own works"
  on storage.objects for select
  using (
    bucket_id = 'qc-photos'
    and exists (
      select 1 from public.works w
       where w.id::text = (storage.foldername(name))[1]
         and w.creator_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. 注文ステータスの導出を直す
--
--   0006 の sync_order_from_jobs は「印刷中のジョブが1件も無ければ printing_queued」
--   としていた。そのため印刷が終わって検品を待っているだけの注文が、購入者には
--   「印刷待ち」と表示されて巻き戻って見える（検品NGで刷り直し待ちのときも同じ）。
--   進行中（printed / qc_failed を含む）は printing に寄せる。
--   設計判断9のとおり、運営が手で書き換えるのではなくここだけが決める。
-- -----------------------------------------------------------------------------
create or replace function public.sync_order_from_jobs() returns trigger
language plpgsql security definer set search_path = public as $$
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

-- -----------------------------------------------------------------------------
-- 5. 通知の行き先が404だったのを直す
--
--   運営コンソールから印刷を開始／発送を登録すると購入者に通知が飛ぶが、
--   `link_path` が `/orders/<id>` になっていて、実装した画面（`/mypage/orders/<id>`）
--   と食い違っていた（実機で通知を出して気づいた）。設計判断3「通知には必ず
--   行き先がある」が成立していないので、DB側を画面に合わせる。
--   修正依頼の通知も同じ理由で `/studio/` 配下へ寄せる（画面はこれから作る）。
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_shipment() returns trigger
language plpgsql security definer set search_path = public as $$
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

create or replace function public.notify_on_print_start() returns trigger
language plpgsql security definer set search_path = public as $$
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

create or replace function public.notify_on_revision() returns trigger
language plpgsql security definer set search_path = public as $$
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

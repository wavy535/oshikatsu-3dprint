-- ============================================================
-- 0010: ビュー
-- DESIGN.md §6.3.E / §8.3 準拠
-- security_invoker = true により、ビュー経由でも基表の RLS が効く
-- ============================================================

-- Admin 向け制作指示書（STL一覧・フィラメント・数量をまとめる）
create or replace view public.admin_production_sheets as
select
  o.id                as order_id,
  o.order_number,
  o.status            as order_status,
  o.paid_at,
  oi.id               as order_item_id,
  oi.item_status,
  oi.product_title,
  oi.filament_name,
  oi.filament_color_hex,
  oi.nui_size_label,
  oi.quantity,
  p.print_note,
  p.est_print_min,
  p.est_weight_g,
  cp.display_name     as creator_name,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assetId',   pa.id,
        'partLabel', pa.part_label,
        'fileName',  pa.original_name,
        'fileSize',  pa.file_size,
        'qtyPerItem',pa.quantity_per_item
      ) order by pa.sort_order
    ) filter (where pa.id is not null), '[]'::jsonb
  ) as assets
from public.orders o
join public.order_items oi on oi.order_id = o.id
join public.products p     on p.id = oi.product_id
join public.profiles cp    on cp.id = oi.creator_id
left join public.product_assets pa on pa.product_id = p.id
group by o.id, oi.id, p.id, cp.display_name;

alter view public.admin_production_sheets set (security_invoker = true);

-- クリエイター向け注文明細ビュー（購入者の住所・氏名・電話は含めない）
create or replace view public.creator_order_items as
select
  oi.id, oi.order_id, oi.product_id, oi.product_title,
  oi.filament_name, oi.nui_size_label,
  oi.quantity, oi.unit_price, oi.line_total,
  oi.commission_rate, oi.creator_revenue,
  oi.item_status, oi.created_at,
  o.order_number, o.status as order_status, o.paid_at, o.shipped_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.creator_id = auth.uid();

alter view public.creator_order_items set (security_invoker = true);

-- Derived views preserve row visibility through visible_* sources.
CREATE VIEW _actual_print_cost AS
SELECT j.order_id,
  CASE WHEN count(*)=count(j.actual_filament_grams) AND count(*)=count(j.actual_print_hours)
  THEN sum(round(coalesce((SELECT sum(-l.delta_grams*f.price_per_gram) FROM filament_ledger l JOIN filaments f ON f.id=l.filament_id WHERE l.print_job_id=j.id AND l.reason='print'),j.actual_filament_grams*r.material_yen_per_gram))
    +round(j.actual_print_hours*r.machine_yen_per_hour)+r.handling_base_yen+r.handling_per_part_yen*max(j.part_count,1)*max(j.quantity,1)) END AS amount
FROM print_jobs j CROSS JOIN (SELECT * FROM print_pricing_rules WHERE is_active LIMIT 1) r
WHERE j.status<>'cancelled' GROUP BY j.order_id;

CREATE VIEW _item_settlements AS
WITH weights AS (
 SELECT oi.id,oi.order_id,CASE WHEN sum(oi.unit_price*oi.quantity) OVER(PARTITION BY oi.order_id)=0 THEN 1 ELSE oi.unit_price*oi.quantity END AS weight FROM order_items oi
), shares AS (
 SELECT *,sum(weight) OVER(PARTITION BY order_id ORDER BY id ROWS UNBOUNDED PRECEDING) AS through,sum(weight) OVER(PARTITION BY order_id) AS total FROM weights
)
SELECT i.id AS item_id,
 round(1.0*s.fee_amount*i.through/i.total)-round(1.0*s.fee_amount*(i.through-i.weight)/i.total) AS fee_amount,
 round(1.0*s.payout_amount*i.through/i.total)-round(1.0*s.payout_amount*(i.through-i.weight)/i.total) AS payout_amount
FROM shares i JOIN order_settlements s ON s.order_id=i.order_id;

CREATE VIEW creator_item_settlements AS SELECT oi.id AS item_id,
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
           FROM visible_work_images wi
          WHERE (wi.work_id = oi.work_id)
          ORDER BY wi.sort_order
         LIMIT 1) AS thumbnail_path,
    p.display_name AS creator_name
   FROM ((((visible_order_items oi
     JOIN visible_order_settlements s ON ((s.order_id = oi.order_id)))
     JOIN _item_settlements amounts ON ((amounts.item_id = oi.id)))
     LEFT JOIN visible_works w ON ((w.id = oi.work_id)))
     LEFT JOIN visible_profiles p ON ((p.id = oi.creator_id)));
CREATE VIEW visible_creator_item_settlements AS SELECT * FROM creator_item_settlements;

CREATE VIEW creator_payout_balances AS WITH items AS (
         SELECT visible_creator_item_settlements.creator_id,
            sum(visible_creator_item_settlements.payout_amount) FILTER (WHERE (visible_creator_item_settlements.is_final AND (visible_creator_item_settlements.status IN ('shipped', 'completed')))) AS settled_payout,
            sum(visible_creator_item_settlements.payout_amount) FILTER (WHERE ((NOT (visible_creator_item_settlements.is_final AND (visible_creator_item_settlements.status IN ('shipped', 'completed')))) AND (visible_creator_item_settlements.status IN ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed')))) AS pending_payout,
            count(*) FILTER (WHERE (visible_creator_item_settlements.status IN ('paid', 'printing_queued', 'printing', 'packaging', 'shipped', 'completed'))) AS sold_items
           FROM visible_creator_item_settlements
          GROUP BY visible_creator_item_settlements.creator_id
        ), charges AS (
         SELECT visible_revision_requests.creator_id,
            sum(visible_revision_requests.reprint_fee_jpy) AS reprint_charges
           FROM visible_revision_requests
          WHERE (visible_revision_requests.charged_to_creator AND (visible_revision_requests.status <> 'cancelled'))
          GROUP BY visible_revision_requests.creator_id
        ), requested AS (
         SELECT visible_payout_requests.creator_id,
            sum(visible_payout_requests.amount) FILTER (WHERE (visible_payout_requests.status IN ('requested', 'processing'))) AS requested_amount,
            sum(visible_payout_requests.amount) FILTER (WHERE (visible_payout_requests.status = 'paid')) AS paid_amount
           FROM visible_payout_requests
          GROUP BY visible_payout_requests.creator_id
        )
 SELECT p.id AS creator_id,
    (COALESCE(i.settled_payout, (0))) AS settled_payout,
    (COALESCE(i.pending_payout, (0))) AS pending_payout,
    (COALESCE(i.sold_items, (0))) AS sold_items,
    (COALESCE(c.reprint_charges, (0))) AS reprint_charges,
    (COALESCE(r.requested_amount, (0))) AS requested_amount,
    (COALESCE(r.paid_amount, (0))) AS paid_amount,
    ((((COALESCE(i.settled_payout, (0)) - COALESCE(c.reprint_charges, (0))) - COALESCE(r.requested_amount, (0))) - COALESCE(r.paid_amount, (0)))) AS available_amount
   FROM (((visible_profiles p
     LEFT JOIN items i ON ((i.creator_id = p.id)))
     LEFT JOIN charges c ON ((c.creator_id = p.id)))
     LEFT JOIN requested r ON ((r.creator_id = p.id)))
  WHERE (p.role IN ('creator', 'admin'));
CREATE VIEW visible_creator_payout_balances AS SELECT * FROM creator_payout_balances;

CREATE VIEW creator_rating_summary AS SELECT creator_id,
    count(*) AS review_count,
    round(avg(rating), 2) AS avg_rating,
    round(avg(design_rating), 2) AS avg_design,
    round(avg(accuracy_rating), 2) AS avg_accuracy,
    round(avg(size_fit_rating), 2) AS avg_size_fit,
    count(*) FILTER (WHERE (rating = 5)) AS five_star_count,
    max(created_at) AS last_reviewed_at
   FROM visible_reviews r
  GROUP BY creator_id;
CREATE VIEW visible_creator_rating_summary AS SELECT * FROM creator_rating_summary;

CREATE VIEW my_favorites AS SELECT f.user_id,
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
   FROM (visible_work_favorites f
     JOIN visible_work_list_items l ON ((l.id = f.work_id)));
CREATE VIEW visible_my_favorites AS SELECT * FROM my_favorites;

CREATE VIEW ops_rating_summary AS SELECT strftime('%Y-%m-01T00:00:00.000Z',created_at) AS month,
    count(*) FILTER (WHERE (print_quality_rating IS NOT NULL)) AS answered_count,
    round(avg(print_quality_rating), 2) AS avg_print_quality,
    round(avg(packaging_rating), 2) AS avg_packaging,
    round(avg(shipping_rating), 2) AS avg_shipping
   FROM visible_reviews r
  GROUP BY (strftime('%Y-%m-01T00:00:00.000Z',created_at));
CREATE VIEW visible_ops_rating_summary AS SELECT * FROM ops_rating_summary;

CREATE VIEW order_settlements AS WITH base AS (
         SELECT o.id AS order_id,
            o.status,
            o.created_at AS ordered_at,
            o.buyer_id,
            o.platform_fee_rate,
            o.total_amount AS gross_amount,
            o.subtotal_amount AS goods_amount,
            o.print_cost_amount AS print_fee_amount,
            o.shipping_fee_amount AS shipping_charged_amount,
            (SELECT amount FROM _actual_print_cost WHERE order_id=o.id) AS print_actual_amount,
            s.shipping_fee_jpy AS shipping_actual_amount,
            s.shipped_at
           FROM (visible_orders o
             LEFT JOIN visible_shipments s ON ((s.order_id = o.id)))
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
    max((round(((pool_amount) * platform_fee_rate))), 0) AS fee_amount,
    (pool_amount - max((round(((pool_amount) * platform_fee_rate))), 0)) AS payout_amount
   FROM pooled;
CREATE VIEW visible_order_settlements AS SELECT * FROM order_settlements;

CREATE VIEW print_queue AS SELECT j.id AS id,
j.job_no AS job_no,
j.status AS status,
j.due_at AS due_at,
j.due_at<strftime('%Y-%m-%dT%H:%M:%fZ','now') AND j.status IN ('queued','printing','reprinting') AS is_overdue,
j.order_id AS order_id,
o.created_at AS ordered_at,
o.buyer_id AS buyer_id,
buyer.display_name AS buyer_name,
o.gift_wrapping AS gift_wrapping,
w.id AS work_id,
w.title AS work_title,
(SELECT storage_path FROM visible_work_images wi WHERE wi.work_id=w.id ORDER BY sort_order LIMIT 1) AS thumbnail_path,
v.id AS variant_id,
v.size_label AS size_label,
v.nui_size_cm AS nui_size_cm,
j.quantity AS quantity,
f.material AS material,
f.color_name AS color_name,
f.color_hex AS color_hex,
j.est_filament_grams AS est_filament_grams,
j.est_print_hours AS est_print_hours,
j.actual_filament_grams AS actual_filament_grams,
j.actual_print_hours AS actual_print_hours,
j.failure_count AS failure_count,
j.part_count AS part_count,
j.batch_count AS batch_count,
j.batch_done AS batch_done,
j.printer_id AS printer_id,
p.code AS printer_code,
j.assignee_id AS assignee_id,
pr.display_name AS assignee_name,
j.created_at AS created_at
 FROM visible_print_jobs j JOIN visible_orders o ON o.id=j.order_id JOIN visible_profiles buyer ON buyer.id=o.buyer_id
 LEFT JOIN visible_work_variants v ON v.id=j.variant_id LEFT JOIN visible_works w ON w.id=v.work_id
 LEFT JOIN visible_printers p ON p.id=j.printer_id LEFT JOIN visible_profiles pr ON pr.id=j.assignee_id
 LEFT JOIN visible_filaments f ON f.id=(SELECT filament_id FROM visible_work_color_slots cs WHERE cs.work_id=w.id ORDER BY slot_index LIMIT 1);
CREATE VIEW visible_print_queue AS SELECT * FROM print_queue;

CREATE VIEW variants_missing_fit_dims AS SELECT v.id AS variant_id,
    v.work_id,
    w.title,
    w.creator_id,
    v.size_label,
    v.is_listed
   FROM (visible_work_variants v
     JOIN visible_works w ON ((w.id = v.work_id)))
  WHERE ((v.fit_width_mm IS NULL) OR (v.fit_height_mm IS NULL) OR (v.fit_depth_mm IS NULL));
CREATE VIEW visible_variants_missing_fit_dims AS SELECT * FROM variants_missing_fit_dims;

CREATE VIEW work_list_items AS SELECT w.id,
    w.creator_id,
    p.display_name AS creator_name,
    w.title,
    w.status,
    w.favorite_count,
    w.min_price_jpy,
    w.previous_min_price_jpy,
    w.price_changed_at,
    ((w.previous_min_price_jpy IS NOT NULL) AND (w.min_price_jpy IS NOT NULL) AND (w.min_price_jpy < w.previous_min_price_jpy) AND (w.price_changed_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'))) AS is_price_dropped,
    (EXISTS ( SELECT 1
           FROM visible_work_variants v
          WHERE ((v.work_id = w.id) AND v.is_listed AND v.is_printable))) AS is_available,
    (EXISTS ( SELECT 1
           FROM visible_work_variants v
          WHERE ((v.work_id = w.id) AND v.is_listed AND (COALESCE(v.stock, 0) > 0)))) AS has_stock,
    COALESCE(r.review_count, 0) AS review_count,
    r.avg_rating,
    w.created_at,
    w.min_buyer_total_jpy
   FROM ((visible_works w
     JOIN visible_profiles p ON ((p.id = w.creator_id)))
     LEFT JOIN ( SELECT visible_reviews.work_id,
            (count(*)) AS review_count,
            round(avg(visible_reviews.rating), 1) AS avg_rating
           FROM visible_reviews
          GROUP BY visible_reviews.work_id) r ON ((r.work_id = w.id)));
CREATE VIEW visible_work_list_items AS SELECT * FROM work_list_items;

CREATE VIEW work_variant_pricing AS SELECT v.id,
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
            WHEN (r.fee_billing = 'bundled') THEN (ceil(((v.print_fee_jpy) / ((1) - r.platform_fee_rate))))
            ELSE 100
        END AS min_price_jpy,
        CASE
            WHEN (v.price_jpy IS NULL) THEN NULL
            WHEN (r.fee_billing = 'separate') THEN (v.price_jpy + v.print_fee_jpy)
            ELSE v.price_jpy
        END AS buyer_total_jpy,
        CASE
            WHEN (v.price_jpy IS NULL) THEN NULL
            WHEN (r.fee_billing = 'separate') THEN (v.price_jpy - (round(((v.price_jpy) * r.platform_fee_rate))))
            ELSE ((v.price_jpy - v.print_fee_jpy) - (round(((v.price_jpy) * r.platform_fee_rate))))
        END AS creator_payout_jpy
   FROM (visible_work_variants v
     CROSS JOIN ( SELECT visible_print_pricing_rules.id,
            visible_print_pricing_rules.effective_from,
            visible_print_pricing_rules.material_yen_per_gram,
            visible_print_pricing_rules.machine_yen_per_hour,
            visible_print_pricing_rules.handling_base_yen,
            visible_print_pricing_rules.handling_per_part_yen,
            visible_print_pricing_rules.platform_fee_rate,
            visible_print_pricing_rules.bed_x_mm,
            visible_print_pricing_rules.bed_y_mm,
            visible_print_pricing_rules.bed_z_mm,
            visible_print_pricing_rules.max_batch_hours,
            visible_print_pricing_rules.is_active,
            visible_print_pricing_rules.created_at,
            visible_print_pricing_rules.fee_billing
           FROM visible_print_pricing_rules
          WHERE visible_print_pricing_rules.is_active
         LIMIT 1) r);
CREATE VIEW visible_work_variant_pricing AS SELECT * FROM work_variant_pricing;

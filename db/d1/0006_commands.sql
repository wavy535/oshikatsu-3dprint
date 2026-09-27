CREATE VIEW _assert AS SELECT NULL AS ok WHERE 0;
CREATE TRIGGER command_assert INSTEAD OF INSERT ON _assert BEGIN
SELECT CASE WHEN NOT coalesce(NEW.ok,0) THEN RAISE(ABORT,'更新対象が変わりました。画面を読み込み直してください') END;
END;

CREATE VIEW _checkout AS SELECT NULL AS order_id,NULL AS address_id,NULL AS request_id,NULL AS note WHERE 0;
CREATE TRIGGER command_checkout INSTEAD OF INSERT ON _checkout BEGIN

SELECT CASE WHEN (SELECT user_id FROM _request_context WHERE id=1) IS NULL THEN RAISE(ABORT,'permission denied: ログインが必要です') END;
SELECT CASE WHEN NEW.request_id IS NULL OR length(NEW.note)>500 THEN RAISE(ABORT,'注文の入力内容が不正です') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE buyer_id=(SELECT user_id FROM _request_context WHERE id=1) AND checkout_request_id=NEW.request_id) THEN RAISE(IGNORE) END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM addresses WHERE id=NEW.address_id AND user_id=(SELECT user_id FROM _request_context WHERE id=1)) THEN RAISE(ABORT,'お届け先が見つかりません') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM print_pricing_rules WHERE is_active) THEN RAISE(ABORT,'有効な料金表がありません') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1)) THEN RAISE(ABORT,'カートが空です') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id JOIN works w ON w.id=v.work_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1) AND (w.status<>'published' OR NOT v.is_listed) AND NOT EXISTS(SELECT 1 FROM custom_order_quotes q WHERE q.variant_id=v.id AND q.buyer_id=(SELECT user_id FROM _request_context WHERE id=1) AND q.status IN ('accepted','ordered'))) THEN RAISE(ABORT,'現在購入できない作品が含まれています') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1) AND NOT v.is_printable) THEN RAISE(ABORT,'造形できないサイズが含まれています') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1) AND v.stock IS NOT NULL AND v.stock<ci.quantity) THEN RAISE(ABORT,'在庫が足りません') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variant_pricing v ON v.id=ci.variant_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1) AND (v.price_jpy IS NULL OR v.buyer_total_jpy IS NULL)) THEN RAISE(ABORT,'価格が決まっていません') END;
INSERT INTO orders(id,buyer_id,status,subtotal_amount,platform_fee_amount,print_cost_amount,shipping_fee_amount,total_amount,shipping_address_id,checkout_request_id,is_demo)
SELECT NEW.order_id,(SELECT user_id FROM _request_context WHERE id=1),'payment_pending',0,0,0,shipping_fee_jpy,0,NEW.address_id,NEW.request_id,1 FROM print_pricing_rules WHERE is_active LIMIT 1;
INSERT INTO order_items(order_id,work_id,creator_id,variant_id,size_label_snapshot,unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,print_fee_snapshot,stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot,color_slots_snapshot,part_instructions_snapshot)
SELECT NEW.order_id,p.work_id,w.creator_id,p.id,p.size_label,p.price_jpy,ci.quantity,p.creator_payout_jpy*ci.quantity,(p.price_jpy-p.creator_payout_jpy)*ci.quantity,p.print_fee_jpy*ci.quantity,p.print_fee_jpy,
coalesce((SELECT storage_path FROM work_assets WHERE work_id=p.work_id AND is_primary LIMIT 1),''),
coalesce((SELECT f.material FROM work_color_slots cs JOIN filaments f ON f.id=cs.filament_id WHERE cs.work_id=p.work_id ORDER BY cs.slot_index LIMIT 1),'未指定'),
coalesce((SELECT f.color_name FROM work_color_slots cs JOIN filaments f ON f.id=cs.filament_id WHERE cs.work_id=p.work_id ORDER BY cs.slot_index LIMIT 1),'未指定'),
(SELECT json_group_array(json_object('slot_index',cs.slot_index,'source_name',cs.source_name,'material',f.material,'color_name',f.color_name,'color_hex',f.color_hex)) FROM (SELECT * FROM work_color_slots WHERE work_id=p.work_id ORDER BY slot_index) cs LEFT JOIN filaments f ON f.id=cs.filament_id),
(SELECT json_group_array(json_object('part',parts.name,'orientation',parts.orientation,'support',parts.support,'support_note',parts.support_note,'note',parts.note)) FROM (SELECT o.name,pi.orientation,pi.support,pi.support_note,pi.note FROM work_part_instructions pi JOIN work_asset_objects o ON o.id=pi.object_id WHERE pi.work_id=p.work_id AND (pi.variant_id IS NULL OR pi.variant_id=p.id) ORDER BY o.object_index) parts)
FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variant_pricing p ON p.id=ci.variant_id JOIN works w ON w.id=p.work_id WHERE c.user_id=(SELECT user_id FROM _request_context WHERE id=1);
UPDATE orders SET subtotal_amount=(SELECT sum(unit_price*quantity) FROM order_items WHERE order_id=NEW.order_id),print_cost_amount=(SELECT sum(print_cost_amount) FROM order_items WHERE order_id=NEW.order_id),platform_fee_amount=(SELECT sum(platform_fee_amount) FROM order_items WHERE order_id=NEW.order_id),total_amount=(SELECT sum(unit_price*quantity+print_cost_amount) FROM order_items WHERE order_id=NEW.order_id)+shipping_fee_amount WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(NEW.order_id,'payment_pending',NEW.note,(SELECT user_id FROM _request_context WHERE id=1));
INSERT INTO _confirm_order(order_id) VALUES(NEW.order_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _confirm_order AS SELECT NULL AS order_id WHERE 0;
CREATE TRIGGER command_confirm_order INSTEAD OF INSERT ON _confirm_order BEGIN

SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_id=(SELECT user_id FROM _request_context WHERE id=1)) THEN RAISE(ABORT,'permission denied: この注文を操作できません') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND (checkout_started_at IS NOT NULL OR stripe_checkout_session_id IS NOT NULL)) THEN RAISE(ABORT,'外部決済の履歴があるため、運営へお問い合わせください') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='payment_pending') THEN RAISE(IGNORE) END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
SELECT CASE WHEN EXISTS(SELECT 1 FROM order_items oi JOIN work_variants v ON v.id=oi.variant_id WHERE oi.order_id=NEW.order_id AND v.stock IS NOT NULL AND v.stock<oi.quantity) THEN RAISE(ABORT,'在庫が足りません') END;
UPDATE orders SET is_demo=1,status='paid',stripe_payment_intent_id='demo-'||NEW.order_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(NEW.order_id,'paid','demo-'||NEW.order_id,(SELECT user_id FROM _request_context WHERE id=1));
UPDATE work_variants SET stock=stock-(SELECT sum(quantity) FROM order_items WHERE order_id=NEW.order_id AND variant_id=work_variants.id) WHERE stock IS NOT NULL AND id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id=(SELECT user_id FROM _request_context WHERE id=1)) AND variant_id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
UPDATE custom_order_quotes SET status='ordered',ordered_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='accepted' AND variant_id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
UPDATE orders SET ship_due_at=coalesce(ship_due_at,strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 days')),status='printing_queued',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id;
INSERT INTO print_jobs(order_id,order_item_id,variant_id,quantity,part_count,batch_count,est_filament_grams,est_print_hours,print_fee_snapshot,due_at)
SELECT oi.order_id,oi.id,oi.variant_id,oi.quantity,coalesce(v.part_count,1),coalesce(v.batch_count,1),v.est_filament_grams*oi.quantity,v.est_print_hours*oi.quantity,coalesce(oi.print_fee_snapshot,v.print_fee_jpy),o.ship_due_at
FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN work_variants v ON v.id=oi.variant_id WHERE oi.order_id=NEW.order_id AND NOT EXISTS(SELECT 1 FROM print_jobs WHERE order_item_id=oi.id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _cancel_order AS SELECT NULL AS order_id WHERE 0;
CREATE TRIGGER command_cancel_order INSTEAD OF INSERT ON _cancel_order BEGIN

SELECT CASE WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service') AND (SELECT user_id FROM _request_context WHERE id=1) IS NULL THEN RAISE(ABORT,'permission denied: ログインが必要です') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_id IS NOT (SELECT user_id FROM _request_context WHERE id=1)) AND NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR EXISTS(SELECT 1 FROM profiles WHERE id=(SELECT user_id FROM _request_context WHERE id=1) AND role='admin')) THEN RAISE(ABORT,'permission denied: この注文を取り消す権限がありません') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='payment_pending') THEN RAISE(IGNORE) END;
SELECT CASE WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service') AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND checkout_started_at IS NOT NULL) THEN RAISE(ABORT,'permission denied: 決済状況を確認してから取り消してください') END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE orders SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) SELECT id,'cancelled','未払い注文の取消',coalesce((SELECT user_id FROM _request_context WHERE id=1),buyer_id) FROM orders WHERE id=NEW.order_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _accept_quote AS SELECT NULL AS quote_id,NULL AS work_id,NULL AS variant_id WHERE 0;
CREATE TRIGGER command_accept_quote INSTEAD OF INSERT ON _accept_quote BEGIN

SELECT CASE WHEN (SELECT user_id FROM _request_context WHERE id=1) IS NULL THEN RAISE(ABORT,'permission denied: ログインが必要です') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id) THEN RAISE(ABORT,'見積りが見つかりません') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND buyer_id=(SELECT user_id FROM _request_context WHERE id=1)) THEN RAISE(ABORT,'permission denied: この見積りを承認できるのは依頼した本人だけです') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND status='sent') THEN RAISE(ABORT,'提示中の見積りではありません') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND expires_at<strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN RAISE(ABORT,'この見積りは有効期限を過ぎています') END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO works(id,creator_id,title,description,status) SELECT NEW.work_id,creator_id,'オーダーメイド '||quote_no,coalesce(note,''),'draft' FROM custom_order_quotes WHERE id=NEW.quote_id AND base_work_id IS NULL;
INSERT INTO work_variants(id,work_id,size_label,scale_ratio,asset_id,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,est_filament_grams,est_print_hours,part_count,price_jpy,stock,is_listed)
SELECT NEW.variant_id,coalesce(base_work_id,NEW.work_id),'オーダーメイド '||quote_no,1,asset_id,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,est_filament_grams,est_print_hours,part_count,price_jpy,1,0 FROM custom_order_quotes WHERE id=NEW.quote_id;
UPDATE custom_order_quotes SET status='accepted',variant_id=NEW.variant_id,accepted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.quote_id;
UPDATE custom_order_requests SET status='accepted' WHERE id=(SELECT request_id FROM custom_order_quotes WHERE id=NEW.quote_id);
INSERT INTO cart_items(cart_id,variant_id,quantity) SELECT id,NEW.variant_id,1 FROM carts WHERE user_id=(SELECT user_id FROM _request_context WHERE id=1) ON CONFLICT(cart_id,variant_id) DO NOTHING;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _decline_quote AS SELECT NULL AS quote_id WHERE 0;
CREATE TRIGGER command_decline_quote INSTEAD OF INSERT ON _decline_quote BEGIN

SELECT CASE WHEN (SELECT user_id FROM _request_context WHERE id=1) IS NULL THEN RAISE(ABORT,'permission denied: ログインが必要です') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND buyer_id IS NOT (SELECT user_id FROM _request_context WHERE id=1)) THEN RAISE(ABORT,'permission denied: この見積りを辞退できるのは依頼した本人だけです') END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE custom_order_quotes SET status='declined',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.quote_id AND status='sent';
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _grant_admin AS SELECT NULL AS email WHERE 0;
CREATE TRIGGER command_grant_admin INSTEAD OF INSERT ON _grant_admin BEGIN

SELECT CASE WHEN NOT (EXISTS(SELECT 1 FROM profiles WHERE id=(SELECT user_id FROM _request_context WHERE id=1) AND role='admin')) THEN RAISE(ABORT,'permission denied: 運営だけが実行できます') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_users WHERE lower(email)=lower(trim(NEW.email))) THEN RAISE(ABORT,'そのメールアドレスで登録されたユーザーが見つかりません') END;
SELECT CASE WHEN EXISTS(SELECT 1 FROM profiles p JOIN app_users u ON u.id=p.id WHERE lower(u.email)=lower(trim(NEW.email)) AND p.role='admin') THEN RAISE(ABORT,'すでに運営メンバーです') END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE profiles SET role_before_admin=role,role='admin' WHERE id=(SELECT id FROM app_users WHERE lower(email)=lower(trim(NEW.email)) LIMIT 1);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE VIEW _revoke_admin AS SELECT NULL AS user_id WHERE 0;
CREATE TRIGGER command_revoke_admin INSTEAD OF INSERT ON _revoke_admin BEGIN

SELECT CASE WHEN NOT (EXISTS(SELECT 1 FROM profiles WHERE id=(SELECT user_id FROM _request_context WHERE id=1) AND role='admin')) THEN RAISE(ABORT,'permission denied: 運営だけが実行できます') END;
SELECT CASE WHEN NEW.user_id=(SELECT user_id FROM _request_context WHERE id=1) THEN RAISE(ABORT,'自分自身は解除できません（他の運営メンバーに頼んでください）') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND role='admin') THEN RAISE(ABORT,'そのユーザーは運営メンバーではありません') END;
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE profiles SET role=coalesce(role_before_admin,CASE WHEN EXISTS(SELECT 1 FROM creator_applications WHERE user_id=NEW.user_id AND status='approved') THEN 'creator' ELSE 'buyer' END),role_before_admin=NULL WHERE id=NEW.user_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

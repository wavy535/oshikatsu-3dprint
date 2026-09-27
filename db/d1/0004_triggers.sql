CREATE VIEW _notify AS SELECT NULL AS user_id,NULL AS kind,NULL AS title,NULL AS body,NULL AS link_path,NULL AS source_table,NULL AS source_id WHERE 0;
CREATE TRIGGER dispatch_notification INSTEAD OF INSERT ON _notify BEGIN
INSERT INTO notifications(user_id,kind,title,body,link_path,source_table,source_id)
SELECT NEW.user_id,NEW.kind,NEW.title,NEW.body,NEW.link_path,NEW.source_table,NEW.source_id
WHERE NEW.user_id IS NOT NULL AND (NEW.kind IN ('order_shipping','creator') OR coalesce((SELECT in_app FROM notification_preferences WHERE user_id=NEW.user_id AND kind=NEW.kind),1)) ON CONFLICT DO NOTHING;
END;
CREATE TABLE _sequences(name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO _sequences VALUES('job',1000),('quote',1000),('revision',1000);

CREATE TRIGGER create_profile_and_cart AFTER INSERT ON app_users BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

INSERT INTO profiles(id,display_name) VALUES(NEW.id,coalesce(nullif(NEW.name,''),substr(NEW.email,1,instr(NEW.email,'@')-1)));
INSERT INTO carts(user_id) VALUES(NEW.id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER guard_profile_role BEFORE UPDATE OF role ON profiles BEGIN
SELECT (CASE WHEN NEW.role IS NOT OLD.role AND NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR EXISTS(SELECT 1 FROM profiles WHERE id=(SELECT user_id FROM _request_context WHERE id=1) AND role='admin')) THEN RAISE(ABORT,'permission denied: role は運営だけが変更できます') END);
END;

CREATE TRIGGER creator_application_email_check BEFORE INSERT ON creator_applications BEGIN
SELECT (CASE WHEN NEW.terms_version IS NULL OR length(trim(NEW.terms_version))=0 THEN RAISE(ABORT,'terms_not_agreed') END);
SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM app_users WHERE id=NEW.user_id AND email_verified=1) THEN RAISE(ABORT,'email_not_verified') END);
END;

CREATE TRIGGER creator_application_consent AFTER INSERT ON creator_applications BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE creator_applications SET terms_agreed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),phone=NULL,phone_verified_at=NULL WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER creator_application_review AFTER UPDATE OF status ON creator_applications WHEN NEW.status IS NOT OLD.status BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE profiles SET role='creator' WHERE id=NEW.user_id AND role='buyer' AND NEW.status='approved';
UPDATE creator_applications SET reviewed_at=coalesce(NEW.reviewed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=NEW.id AND NEW.status IN ('approved','rejected');
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.user_id,'creator',(CASE NEW.status WHEN 'approved' THEN 'クリエイター登録が承認されました' ELSE 'クリエイター申請は承認されませんでした' END),(CASE NEW.status WHEN 'approved' THEN '作品の投稿ができるようになりました。まずは作品管理から3Dデータを登録してください。' ELSE coalesce('運営より：'||nullif(trim(NEW.admin_note),''),'内容を見直して、あらためて申請できます。') END),(CASE NEW.status WHEN 'approved' THEN '/studio/works' ELSE '/creator/apply' END),'creator_applications',NEW.id  WHERE NEW.status IN ('approved','rejected');
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER touch_profiles AFTER UPDATE OF "id","role","display_name","avatar_url","bio","sns_links","created_at","role_before_admin" ON profiles BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE profiles SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER touch_payout_accounts AFTER UPDATE OF "creator_id","bank_name","branch_name","account_type","account_number","account_holder_name","created_at" ON payout_accounts BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE payout_accounts SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE creator_id=NEW.creator_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER touch_orders AFTER UPDATE OF "id","buyer_id","status","subtotal_amount","platform_fee_amount","print_cost_amount","total_amount","shipping_address_id","stripe_payment_intent_id","tracking_number","shipped_at","created_at","ship_due_at","gift_wrapping","shipping_fee_amount","platform_fee_rate","checkout_started_at","stripe_checkout_session_id","is_demo","checkout_request_id" ON orders BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE orders SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER touch_works AFTER UPDATE OF "id","creator_id","title","description","status","created_at","accepts_color_change","accepts_mirror","accepts_stand_hole","accepts_custom_size","accepts_other_request","favorite_count","min_price_jpy","previous_min_price_jpy","price_changed_at","min_buyer_total_jpy" ON works BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER nui_size_insert AFTER INSERT ON nui_profiles BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE nui_profiles SET nui_size_cm=(CASE WHEN NEW.height_mm<125 THEN 10 WHEN NEW.height_mm<175 THEN 15 ELSE 20 END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER nui_size_update AFTER UPDATE OF height_mm ON nui_profiles BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE nui_profiles SET nui_size_cm=(CASE WHEN NEW.height_mm<125 THEN 10 WHEN NEW.height_mm<175 THEN 15 ELSE 20 END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER first_nui_is_main AFTER INSERT ON nui_profiles WHEN NOT EXISTS(SELECT 1 FROM nui_profiles WHERE user_id=NEW.user_id AND id<>NEW.id) BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE nui_profiles SET is_main=1 WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER scan_ready AFTER UPDATE OF status ON nui_scans WHEN NEW.status='ready' AND OLD.status IS NOT 'ready' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE nui_profiles SET has_scan=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.nui_id;
UPDATE nui_scans SET completed_at=coalesce(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=NEW.id;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.user_id,'announcement',coalesce((SELECT name FROM nui_profiles WHERE id=NEW.nui_id),'ぬい')||' の3Dモデルができました','作品ページで「うちの子で見る」が使えるようになりました','/my-nui/'||coalesce(NEW.nui_id,''),'nui_scans',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER favorite_count_insert AFTER INSERT ON work_favorites BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET favorite_count=(SELECT count(*) FROM work_favorites WHERE work_id=NEW.work_id) WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER favorite_count_delete AFTER DELETE ON work_favorites BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET favorite_count=(SELECT count(*) FROM work_favorites WHERE work_id=OLD.work_id) WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_validate_insert BEFORE INSERT ON work_variants BEGIN
SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM print_pricing_rules WHERE is_active) THEN RAISE(ABORT,'有効な print_pricing_rules がありません') END);
SELECT (CASE WHEN NEW.is_listed AND NOT (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) AND NEW.price_jpy IS NOT NULL AND NEW.price_jpy < (SELECT (CASE WHEN fee_billing='bundled' THEN ceil((SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1)/(1-platform_fee_rate)) ELSE 100 END) FROM print_pricing_rules WHERE is_active LIMIT 1) THEN RAISE(ABORT,'販売価格が下限を下回っています') END);
END;

CREATE TRIGGER variant_validate_update BEFORE UPDATE ON work_variants BEGIN
SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM print_pricing_rules WHERE is_active) THEN RAISE(ABORT,'有効な print_pricing_rules がありません') END);
SELECT (CASE WHEN NEW.is_listed AND NOT (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) AND NEW.price_jpy IS NOT NULL AND NEW.price_jpy < (SELECT (CASE WHEN fee_billing='bundled' THEN ceil((SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1)/(1-platform_fee_rate)) ELSE 100 END) FROM print_pricing_rules WHERE is_active LIMIT 1) THEN RAISE(ABORT,'販売価格が下限を下回っています') END);
END;

CREATE TRIGGER variant_calculate_insert AFTER INSERT ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE work_variants SET print_fee_jpy=(SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1),
 is_printable=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL THEN NOT (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) ELSE NEW.is_printable END),
 is_listed=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL AND (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) THEN 0 ELSE NEW.is_listed END),
 unprintable_reason=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL THEN (CASE WHEN EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm)) THEN '造形サイズがベッド上限を超過しています' END) ELSE NEW.unprintable_reason END),
 batch_count=(CASE WHEN NEW.batch_count_override IS NOT NULL THEN max(NEW.batch_count_override,1) WHEN NEW.est_print_hours IS NOT NULL THEN max(ceil(NEW.est_print_hours/(SELECT max_batch_hours FROM print_pricing_rules WHERE is_active LIMIT 1)),1) ELSE NEW.batch_count END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_calculate_update AFTER UPDATE OF est_filament_grams,est_print_hours,part_count,bbox_x_mm,bbox_y_mm,bbox_z_mm,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,batch_count_override,oversized_parts ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE work_variants SET print_fee_jpy=(SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1),
 is_printable=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL THEN NOT (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) ELSE NEW.is_printable END),
 is_listed=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL AND (EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm))) THEN 0 ELSE NEW.is_listed END),
 unprintable_reason=(CASE WHEN coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm) IS NOT NULL AND coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm) IS NOT NULL THEN (CASE WHEN EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>max(r.bed_x_mm,r.bed_y_mm) OR min(coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm),coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm))>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm),0)>r.bed_z_mm)) THEN '造形サイズがベッド上限を超過しています' END) ELSE NEW.unprintable_reason END),
 batch_count=(CASE WHEN NEW.batch_count_override IS NOT NULL THEN max(NEW.batch_count_override,1) WHEN NEW.est_print_hours IS NOT NULL THEN max(ceil(NEW.est_print_hours/(SELECT max_batch_hours FROM print_pricing_rules WHERE is_active LIMIT 1)),1) ELSE NEW.batch_count END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_fit_insert AFTER INSERT ON work_variants WHEN NOT NEW.is_base AND NEW.fit_width_mm IS NULL AND EXISTS(SELECT 1 FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id AND fit_width_mm IS NOT NULL) BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE work_variants SET fit_width_mm=(SELECT round(fit_width_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_height_mm=(SELECT round(fit_height_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_depth_mm=(SELECT round(fit_depth_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),fit_source='auto' WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_fit_update AFTER UPDATE OF scale_ratio ON work_variants WHEN NOT NEW.is_base AND NEW.fit_width_mm IS NULL AND EXISTS(SELECT 1 FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id AND fit_width_mm IS NOT NULL) BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE work_variants SET fit_width_mm=(SELECT round(fit_width_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_height_mm=(SELECT round(fit_height_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_depth_mm=(SELECT round(fit_depth_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),fit_source='auto' WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_invalidate_tryon AFTER UPDATE ON work_variants WHEN NEW.updated_at IS NOT OLD.updated_at BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
DELETE FROM tryon_renders WHERE variant_id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_min_price_insert AFTER INSERT ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET previous_min_price_jpy=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL) THEN min_price_jpy ELSE previous_min_price_jpy END),price_changed_at=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL) THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE price_changed_at END),min_price_jpy=(SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL),min_buyer_total_jpy=(SELECT min(buyer_total_jpy) FROM work_variant_pricing WHERE work_id=NEW.work_id AND is_listed AND buyer_total_jpy IS NOT NULL) WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_min_price_update AFTER UPDATE OF price_jpy,is_listed,print_fee_jpy ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET previous_min_price_jpy=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL) THEN min_price_jpy ELSE previous_min_price_jpy END),price_changed_at=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL) THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE price_changed_at END),min_price_jpy=(SELECT min(price_jpy) FROM work_variants WHERE work_id=NEW.work_id AND is_listed AND price_jpy IS NOT NULL),min_buyer_total_jpy=(SELECT min(buyer_total_jpy) FROM work_variant_pricing WHERE work_id=NEW.work_id AND is_listed AND buyer_total_jpy IS NOT NULL) WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER variant_min_price_delete AFTER DELETE ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET previous_min_price_jpy=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=OLD.work_id AND is_listed AND price_jpy IS NOT NULL) THEN min_price_jpy ELSE previous_min_price_jpy END),price_changed_at=(CASE WHEN min_price_jpy IS NOT (SELECT min(price_jpy) FROM work_variants WHERE work_id=OLD.work_id AND is_listed AND price_jpy IS NOT NULL) THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE price_changed_at END),min_price_jpy=(SELECT min(price_jpy) FROM work_variants WHERE work_id=OLD.work_id AND is_listed AND price_jpy IS NOT NULL),min_buyer_total_jpy=(SELECT min(buyer_total_jpy) FROM work_variant_pricing WHERE work_id=OLD.work_id AND is_listed AND buyer_total_jpy IS NOT NULL) WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER order_fee_snapshot AFTER INSERT ON orders WHEN NEW.platform_fee_rate IS NULL BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE orders SET platform_fee_rate=(SELECT platform_fee_rate FROM print_pricing_rules WHERE is_active LIMIT 1) WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER order_print_files_snapshot AFTER INSERT ON order_items BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE order_items SET print_assets_snapshot=(CASE WHEN EXISTS(SELECT 1 FROM work_assets WHERE work_id=NEW.work_id) THEN
(SELECT json_group_array(json_object('file_name',a.file_name,'storage_path',a.storage_path,'file_format',a.file_format,'scale_ratio',v.scale_ratio)) FROM (SELECT * FROM work_assets WHERE work_id=NEW.work_id ORDER BY is_primary DESC,created_at,id) a JOIN work_variants v ON v.id=NEW.variant_id)
WHEN NEW.stl_storage_path_snapshot<>'' THEN json_array(json_object('file_name','印刷データ','storage_path',NEW.stl_storage_path_snapshot)) ELSE '[]' END) WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER filament_ledger_apply AFTER INSERT ON filament_ledger BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE filaments SET stock_grams=max(stock_grams+round(NEW.delta_grams),0) WHERE id=NEW.filament_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER shipment_apply AFTER INSERT ON shipments BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE orders SET status='shipped',tracking_number=NEW.tracking_number,shipped_at=NEW.shipped_at,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER number_print_jobs AFTER INSERT ON print_jobs WHEN NEW.job_no IS NULL OR NEW.job_no='' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE _sequences SET value=value+1 WHERE name='job'; UPDATE print_jobs SET job_no='J-'||(SELECT value FROM _sequences WHERE name='job') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER number_custom_order_quotes AFTER INSERT ON custom_order_quotes WHEN NEW.quote_no IS NULL OR NEW.quote_no='' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE _sequences SET value=value+1 WHERE name='quote'; UPDATE custom_order_quotes SET quote_no='CR-'||(SELECT value FROM _sequences WHERE name='quote') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER number_revision_requests AFTER INSERT ON revision_requests WHEN NEW.revision_no IS NULL OR NEW.revision_no='' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE _sequences SET value=value+1 WHERE name='revision'; UPDATE revision_requests SET revision_no='RV-'||(SELECT value FROM _sequences WHERE name='revision') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER quote_calculate_insert AFTER INSERT ON custom_order_quotes BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE custom_order_quotes SET print_fee_jpy=(CASE WHEN NEW.est_filament_grams IS NOT NULL AND NEW.est_print_hours IS NOT NULL THEN (SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1) ELSE NEW.print_fee_jpy END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER quote_calculate_update AFTER UPDATE OF est_filament_grams,est_print_hours,part_count ON custom_order_quotes BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE custom_order_quotes SET print_fee_jpy=(CASE WHEN NEW.est_filament_grams IS NOT NULL AND NEW.est_print_hours IS NOT NULL THEN (SELECT round(coalesce(NEW.est_filament_grams,0)*material_yen_per_gram)+round(coalesce(NEW.est_print_hours,0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(NEW.part_count,1),1) FROM print_pricing_rules WHERE is_active LIMIT 1) ELSE NEW.print_fee_jpy END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER revision_charge_insert AFTER INSERT ON revision_requests BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE revision_requests SET charged_to_creator=NEW.cause='model',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER revision_charge_update AFTER UPDATE OF cause ON revision_requests BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE revision_requests SET charged_to_creator=NEW.cause='model',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER revision_unlist_insert AFTER INSERT ON revision_requests WHEN NEW.status IN ('open','in_progress') BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE work_variants SET is_listed=0 WHERE id=NEW.variant_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER revision_unlist_update AFTER UPDATE OF status ON revision_requests WHEN NEW.status IN ('open','in_progress') BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE work_variants SET is_listed=0 WHERE id=NEW.variant_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER print_job_touch AFTER UPDATE OF status ON print_jobs BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE print_jobs SET started_at=(CASE WHEN NEW.status='printing' AND OLD.status IS NOT 'printing' THEN coalesce(NEW.started_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NEW.started_at END),finished_at=(CASE WHEN NEW.status IN ('printed','qc_passed') THEN coalesce(NEW.finished_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NEW.finished_at END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER print_job_event_insert AFTER INSERT ON print_jobs BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO print_job_events(print_job_id,status) VALUES(NEW.id,NEW.status);
UPDATE orders SET status=(CASE WHEN (SELECT count(*)=sum(status='qc_passed') FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled') THEN 'packaging' WHEN EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status IN ('printing','reprinting','printed','qc_failed')) THEN 'printing' ELSE 'printing_queued' END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id AND status IN ('paid','printing_queued','printing','packaging') AND EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled');
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER print_job_event_update AFTER UPDATE OF status ON print_jobs WHEN NEW.status IS NOT OLD.status BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO print_job_events(print_job_id,status) VALUES(NEW.id,NEW.status);
UPDATE orders SET status=(CASE WHEN (SELECT count(*)=sum(status='qc_passed') FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled') THEN 'packaging' WHEN EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status IN ('printing','reprinting','printed','qc_failed')) THEN 'printing' ELSE 'printing_queued' END),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.order_id AND status IN ('paid','printing_queued','printing','packaging') AND EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled');
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER qc_result_apply AFTER INSERT ON qc_inspections BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;

UPDATE print_jobs SET status=(CASE NEW.result WHEN 'passed' THEN 'qc_passed' ELSE 'qc_failed' END),failure_count=failure_count+(CASE WHEN NEW.result='failed' THEN 1 ELSE 0 END) WHERE id=NEW.print_job_id;
INSERT INTO revision_requests(work_id,variant_id,creator_id,inspection_id,print_job_id,cause,message,photo_paths,reprint_fee_jpy,created_by)
SELECT w.id,v.id,w.creator_id,NEW.id,j.id,NEW.reprint_cause,coalesce(NEW.memo,'検品で不合格になりました'),NEW.photo_paths,coalesce(j.print_fee_snapshot,v.print_fee_jpy,0),NEW.inspector_id
FROM print_jobs j JOIN work_variants v ON v.id=j.variant_id JOIN works w ON w.id=v.work_id
WHERE j.id=NEW.print_job_id AND NEW.result='failed' AND NEW.reprint_cause='model' AND NOT EXISTS(SELECT 1 FROM revision_requests WHERE print_job_id=j.id AND status IN ('open','in_progress'));
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER payout_request_check BEFORE INSERT ON payout_requests BEGIN
SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM payout_accounts WHERE creator_id=NEW.creator_id) THEN RAISE(ABORT,'振込先口座が登録されていません') END);
SELECT (CASE WHEN NEW.amount>coalesce((SELECT available_amount FROM creator_payout_balances WHERE creator_id=NEW.creator_id),0) THEN RAISE(ABORT,'申請額が受取可能額を超えています') END);
SELECT (CASE WHEN NEW.amount<1000 THEN RAISE(ABORT,'振込の申請は ¥1,000 から受け付けています') END);
END;

CREATE TRIGGER message_notify AFTER INSERT ON messages BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.recipient_id,'message',coalesce((SELECT display_name FROM profiles WHERE id=NEW.sender_id),'ユーザー')||' さんからメッセージが届きました',substr(NEW.body,1,60),'/mypage/messages?with='||NEW.sender_id,'messages',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER question_notify AFTER INSERT ON qna_threads BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT w.creator_id,'creator','作品に質問が届きました',w.title||' ／ '||substr(NEW.question,1,60),'/works/'||NEW.work_id||'/qa','qna_threads',NEW.id FROM works w WHERE w.id=NEW.work_id AND w.creator_id<>NEW.asker_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER answer_notify AFTER UPDATE OF answer ON qna_threads WHEN NEW.answer IS NOT NULL AND OLD.answer IS NULL BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.asker_id,'message','質問に回答がありました',coalesce((SELECT title FROM works WHERE id=NEW.work_id),'作品')||' ／ '||substr(NEW.answer,1,60),'/works/'||NEW.work_id||'/qa','qna_threads',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER review_notify AFTER INSERT ON reviews BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.creator_id,'review','レビューが届きました',coalesce((SELECT title FROM works WHERE id=NEW.work_id),'作品')||' に ★'||NEW.rating||' のレビューが付きました','/works/'||NEW.work_id||'/reviews','reviews',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER revision_notify AFTER INSERT ON revision_requests BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.creator_id,'creator','検品で修正依頼が発生しました',coalesce(NEW.revision_no,'修正依頼')||' ／ 原因: '||NEW.cause||' ／ 期限 '||strftime('%m月%d日',NEW.due_at),'/studio/revisions/'||NEW.id,'revision_requests',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER print_start_notify AFTER UPDATE OF status ON print_jobs WHEN NEW.status='printing' AND OLD.status IS NOT 'printing' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT (SELECT buyer_id FROM orders WHERE id=NEW.order_id),'order_shipping','印刷を開始しました','ジョブ '||coalesce(NEW.job_no,NEW.id),'/mypage/orders/'||NEW.order_id,'print_jobs',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER shipment_notify AFTER INSERT ON shipments BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT (SELECT buyer_id FROM orders WHERE id=NEW.order_id),'order_shipping','ご注文の商品を発送しました',coalesce(NEW.service_name,'宅配便')||(CASE WHEN NEW.tracking_number IS NOT NULL THEN ' ／ 追跡番号 '||NEW.tracking_number ELSE '' END),'/mypage/orders/'||NEW.order_id,'shipments',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER sale_notify AFTER UPDATE OF status ON orders WHEN NEW.status='paid' AND OLD.status='payment_pending' BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT oi.creator_id,'creator','作品が売れました',coalesce(w.title,'作品')||' ×'||oi.quantity||' ／ 受取（見込み） ¥'||printf('%,d',oi.creator_payout_amount),'/studio','order_items',oi.id FROM order_items oi LEFT JOIN works w ON w.id=oi.work_id WHERE oi.order_id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER price_drop_notify AFTER UPDATE OF min_price_jpy ON works WHEN NEW.min_price_jpy IS NOT OLD.min_price_jpy AND NEW.min_price_jpy<NEW.previous_min_price_jpy BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT f.user_id,'favorite_price','お気に入りの作品が値下げされました',NEW.title||'　¥'||printf('%,d',NEW.previous_min_price_jpy)||' → ¥'||printf('%,d',NEW.min_price_jpy),'/works/'||NEW.id,'works_price',lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) FROM work_favorites f WHERE f.work_id=NEW.id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER payout_notify AFTER UPDATE OF status ON payout_requests WHEN NEW.status IS NOT OLD.status AND NEW.status IN ('paid','rejected') BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.creator_id,'creator',(CASE NEW.status WHEN 'paid' THEN '振込が完了しました' ELSE '振込の申請が差し戻されました' END),'¥'||printf('%,d',NEW.amount)||(CASE NEW.status WHEN 'paid' THEN ' を振り込みました' ELSE ' の申請を確認してください' END),'/studio/payouts','payout_requests',NEW.id  WHERE 1;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER quote_notify_insert AFTER INSERT ON custom_order_quotes BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.buyer_id,'message','オーダーメイドの見積りが届きました',coalesce(NEW.quote_no,'見積り')||' ／ 合計 ¥'||printf('%,d',NEW.price_jpy+NEW.print_fee_jpy+NEW.shipping_fee_jpy)||' ／ 有効期限 '||strftime('%m月%d日',NEW.expires_at),'/mypage/custom-orders/'||NEW.request_id,'custom_order_quotes',NEW.id  WHERE NEW.status='sent';
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER quote_notify_update AFTER UPDATE OF status ON custom_order_quotes WHEN NEW.status IS NOT OLD.status BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.buyer_id,'message','オーダーメイドの見積りが届きました',coalesce(NEW.quote_no,'見積り')||' ／ 合計 ¥'||printf('%,d',NEW.price_jpy+NEW.print_fee_jpy+NEW.shipping_fee_jpy)||' ／ 有効期限 '||strftime('%m月%d日',NEW.expires_at),'/mypage/custom-orders/'||NEW.request_id,'custom_order_quotes',NEW.id  WHERE NEW.status='sent';
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.creator_id,'creator',(CASE NEW.status WHEN 'accepted' THEN '見積りが承認されました' WHEN 'ordered' THEN 'オーダーメイドが注文されました' ELSE '見積りが辞退されました' END),coalesce(NEW.quote_no,'見積り')||' ／ '||coalesce((SELECT display_name FROM profiles WHERE id=NEW.buyer_id),'購入者')||' さん','/studio/custom-orders/'||NEW.request_id,'custom_order_quotes',NEW.id  WHERE NEW.status IN ('accepted','declined','ordered');
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.buyer_id,'message','見積りの有効期限が切れました',coalesce(NEW.quote_no,'見積り')||' ／ 続けたい場合は相談から見積りを依頼し直してください','/mypage/custom-orders/'||NEW.request_id,'custom_order_quotes',NEW.id  WHERE NEW.status='expired';
INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT NEW.creator_id,'creator','見積りの有効期限が切れました',coalesce(NEW.quote_no,'見積り')||' ／ 承認されないまま期限を過ぎました','/studio/custom-orders/'||NEW.request_id,'custom_order_quotes',NEW.id  WHERE NEW.status='expired';
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

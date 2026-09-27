-- Monotonic versions detect edits while geometry analysis runs outside D1.

ALTER TABLE works ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER version_work_assets_insert AFTER INSERT ON work_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_assets_update AFTER UPDATE ON work_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_assets_delete AFTER DELETE ON work_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_ar_assets_insert AFTER INSERT ON work_ar_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_ar_assets_update AFTER UPDATE ON work_ar_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_ar_assets_delete AFTER DELETE ON work_ar_assets BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_asset_objects_insert AFTER INSERT ON work_asset_objects BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=NEW.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_asset_objects_update AFTER UPDATE ON work_asset_objects BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=NEW.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_asset_objects_delete AFTER DELETE ON work_asset_objects BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=OLD.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_validation_issues_insert AFTER INSERT ON work_validation_issues BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=NEW.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_validation_issues_update AFTER UPDATE ON work_validation_issues BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=NEW.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_validation_issues_delete AFTER DELETE ON work_validation_issues BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=(SELECT work_id FROM work_assets WHERE id=OLD.asset_id);
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_color_slots_insert AFTER INSERT ON work_color_slots BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_color_slots_update AFTER UPDATE ON work_color_slots BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_color_slots_delete AFTER DELETE ON work_color_slots BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_part_instructions_insert AFTER INSERT ON work_part_instructions BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_part_instructions_update AFTER UPDATE ON work_part_instructions BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_part_instructions_delete AFTER DELETE ON work_part_instructions BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_variants_insert AFTER INSERT ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_variants_update AFTER UPDATE ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_variants_delete AFTER DELETE ON work_variants BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_images_insert AFTER INSERT ON work_images BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_images_update AFTER UPDATE ON work_images BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_images_delete AFTER DELETE ON work_images BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_tags_insert AFTER INSERT ON work_tags BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_tags_update AFTER UPDATE ON work_tags BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_tags_delete AFTER DELETE ON work_tags BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_assembly_insert AFTER INSERT ON work_assembly BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_assembly_update AFTER UPDATE ON work_assembly BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_work_assembly_delete AFTER DELETE ON work_assembly BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=OLD.work_id;
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;

CREATE TRIGGER version_works AFTER UPDATE OF id,creator_id,title,description,status,created_at,accepts_color_change,accepts_mirror,accepts_stand_hole,accepts_custom_size,accepts_other_request,favorite_count,min_price_jpy,previous_min_price_jpy,price_changed_at,min_buyer_total_jpy ON works BEGIN UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.id; END;

CREATE TRIGGER creator_only_works BEFORE INSERT ON works WHEN (SELECT role='app_user' AND internal_depth=0 FROM _request_context WHERE id=1) AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.creator_id AND role IN ('creator','admin')) BEGIN SELECT RAISE(ABORT,'permission denied: 作品の投稿にはクリエイター登録が必要です'); END;

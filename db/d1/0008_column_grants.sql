-- PostgreSQL grants UPDATE(read_at), not table-wide UPDATE, to members.
DROP TRIGGER authorize_notifications_update;
CREATE TRIGGER authorize_notifications_update BEFORE UPDATE ON notifications
WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0)
BEGIN
 SELECT (CASE WHEN OLD.user_id IS NOT (SELECT user_id FROM _request_context WHERE id=1) THEN RAISE(IGNORE) END);
 SELECT (CASE WHEN (SELECT role FROM _request_context WHERE id=1)<>'app_user' OR NEW.user_id IS NOT (SELECT user_id FROM _request_context WHERE id=1) THEN RAISE(ABORT,'permission denied') END);
END;
CREATE TRIGGER authorize_notification_columns BEFORE UPDATE OF "id","user_id","created_at","kind","title","body","link_path","source_table","source_id","emailed_at","pushed_at","email_claim_token","email_claimed_until" ON notifications
WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0)
BEGIN SELECT RAISE(ABORT,'permission denied'); END;

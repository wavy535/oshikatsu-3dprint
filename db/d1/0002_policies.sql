-- Identity is private server state, never supplied by browser form fields.

CREATE VIEW "visible_addresses" AS SELECT * FROM "addresses" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE (o.shipping_address_id = addresses.id)))) OR ((SELECT user_id FROM _request_context WHERE id=1) = addresses.user_id)));

CREATE TRIGGER "authorize_addresses_insert" BEFORE INSERT ON "addresses" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_addresses_update" BEFORE UPDATE ON "addresses" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_addresses_delete" BEFORE DELETE ON "addresses" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_app_users" AS SELECT * FROM "app_users" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR 0;

CREATE TRIGGER "authorize_app_users_insert" BEFORE INSERT ON "app_users" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_app_users_update" BEFORE UPDATE ON "app_users" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_app_users_delete" BEFORE DELETE ON "app_users" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_auth_accounts" AS SELECT * FROM "auth_accounts" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR 0;

CREATE TRIGGER "authorize_auth_accounts_insert" BEFORE INSERT ON "auth_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_accounts_update" BEFORE UPDATE ON "auth_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_accounts_delete" BEFORE DELETE ON "auth_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_auth_rate_limits" AS SELECT * FROM "auth_rate_limits" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR 0;

CREATE TRIGGER "authorize_auth_rate_limits_insert" BEFORE INSERT ON "auth_rate_limits" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_rate_limits_update" BEFORE UPDATE ON "auth_rate_limits" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_rate_limits_delete" BEFORE DELETE ON "auth_rate_limits" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_auth_sessions" AS SELECT * FROM "auth_sessions" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR 0;

CREATE TRIGGER "authorize_auth_sessions_insert" BEFORE INSERT ON "auth_sessions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_sessions_update" BEFORE UPDATE ON "auth_sessions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_sessions_delete" BEFORE DELETE ON "auth_sessions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_auth_verifications" AS SELECT * FROM "auth_verifications" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR 0;

CREATE TRIGGER "authorize_auth_verifications_insert" BEFORE INSERT ON "auth_verifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_verifications_update" BEFORE UPDATE ON "auth_verifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_auth_verifications_delete" BEFORE DELETE ON "auth_verifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_cart_items" AS SELECT * FROM "cart_items" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_cart_items_insert" BEFORE INSERT ON "cart_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = NEW.cart_id) AND (c.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_cart_items_update" BEFORE UPDATE ON "cart_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = OLD.cart_id) AND (c.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = NEW.cart_id) AND (c.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_cart_items_delete" BEFORE DELETE ON "cart_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = OLD.cart_id) AND (c.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_carts" AS SELECT * FROM "carts" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = carts.user_id)));

CREATE TRIGGER "authorize_carts_insert" BEFORE INSERT ON "carts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_carts_update" BEFORE UPDATE ON "carts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_carts_delete" BEFORE DELETE ON "carts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_coordinate_post_pins" AS SELECT * FROM "coordinate_post_pins" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true OR (EXISTS ( SELECT 1
   FROM coordinate_posts p
  WHERE ((p.id = coordinate_post_pins.post_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_coordinate_post_pins_insert" BEFORE INSERT ON "coordinate_post_pins" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM coordinate_posts p
  WHERE ((p.id = NEW.post_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_coordinate_post_pins_update" BEFORE UPDATE ON "coordinate_post_pins" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM coordinate_posts p
  WHERE ((p.id = OLD.post_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM coordinate_posts p
  WHERE ((p.id = NEW.post_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_coordinate_post_pins_delete" BEFORE DELETE ON "coordinate_post_pins" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM coordinate_posts p
  WHERE ((p.id = OLD.post_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_coordinate_posts" AS SELECT * FROM "coordinate_posts" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true));

CREATE TRIGGER "authorize_coordinate_posts_insert" BEFORE INSERT ON "coordinate_posts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_coordinate_posts_update" BEFORE UPDATE ON "coordinate_posts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_coordinate_posts_delete" BEFORE DELETE ON "coordinate_posts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_creator_applications" AS SELECT * FROM "creator_applications" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = creator_applications.user_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))));

CREATE TRIGGER "authorize_creator_applications_insert" BEFORE INSERT ON "creator_applications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT user_id FROM _request_context WHERE id=1)) AND (p.role = 'buyer'))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_creator_applications_update" BEFORE UPDATE ON "creator_applications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_creator_applications_delete" BEFORE DELETE ON "creator_applications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_creator_follows" AS SELECT * FROM "creator_follows" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true OR ((SELECT user_id FROM _request_context WHERE id=1) = creator_follows.follower_id)));

CREATE TRIGGER "authorize_creator_follows_insert" BEFORE INSERT ON "creator_follows" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.follower_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_creator_follows_update" BEFORE UPDATE ON "creator_follows" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.follower_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.follower_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_creator_follows_delete" BEFORE DELETE ON "creator_follows" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.follower_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_custom_order_quotes" AS SELECT * FROM "custom_order_quotes" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (custom_order_quotes.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (custom_order_quotes.creator_id = (SELECT user_id FROM _request_context WHERE id=1))) OR ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (custom_order_quotes.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))));

CREATE TRIGGER "authorize_custom_order_quotes_insert" BEFORE INSERT ON "custom_order_quotes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (NEW.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_custom_order_quotes_update" BEFORE UPDATE ON "custom_order_quotes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (OLD.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (NEW.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_custom_order_quotes_delete" BEFORE DELETE ON "custom_order_quotes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (OLD.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_custom_order_requests" AS SELECT * FROM "custom_order_requests" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = custom_order_requests.requester_id) OR ((SELECT user_id FROM _request_context WHERE id=1) = custom_order_requests.creator_id))));

CREATE TRIGGER "authorize_custom_order_requests_insert" BEFORE INSERT ON "custom_order_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.requester_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_custom_order_requests_update" BEFORE UPDATE ON "custom_order_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = OLD.creator_id) OR ((SELECT user_id FROM _request_context WHERE id=1) = OLD.requester_id)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = NEW.creator_id) OR ((SELECT user_id FROM _request_context WHERE id=1) = NEW.requester_id)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_custom_order_requests_delete" BEFORE DELETE ON "custom_order_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_filament_ledger" AS SELECT * FROM "filament_ledger" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_filament_ledger_insert" BEFORE INSERT ON "filament_ledger" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_filament_ledger_update" BEFORE UPDATE ON "filament_ledger" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_filament_ledger_delete" BEFORE DELETE ON "filament_ledger" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_filaments" AS SELECT * FROM "filaments" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_filaments_insert" BEFORE INSERT ON "filaments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_filaments_update" BEFORE UPDATE ON "filaments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_filaments_delete" BEFORE DELETE ON "filaments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_messages" AS SELECT * FROM "messages" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = messages.sender_id) OR ((SELECT user_id FROM _request_context WHERE id=1) = messages.recipient_id))));

CREATE TRIGGER "authorize_messages_insert" BEFORE INSERT ON "messages" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.sender_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_messages_update" BEFORE UPDATE ON "messages" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.recipient_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.recipient_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_messages_delete" BEFORE DELETE ON "messages" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_notification_preferences" AS SELECT * FROM "notification_preferences" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((notification_preferences.user_id = (SELECT user_id FROM _request_context WHERE id=1))));

CREATE TRIGGER "authorize_notification_preferences_insert" BEFORE INSERT ON "notification_preferences" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notification_preferences_update" BEFORE UPDATE ON "notification_preferences" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notification_preferences_delete" BEFORE DELETE ON "notification_preferences" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_notification_settings" AS SELECT * FROM "notification_settings" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((notification_settings.user_id = (SELECT user_id FROM _request_context WHERE id=1))));

CREATE TRIGGER "authorize_notification_settings_insert" BEFORE INSERT ON "notification_settings" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notification_settings_update" BEFORE UPDATE ON "notification_settings" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notification_settings_delete" BEFORE DELETE ON "notification_settings" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_notifications" AS SELECT * FROM "notifications" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = notifications.user_id)));

CREATE TRIGGER "authorize_notifications_insert" BEFORE INSERT ON "notifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notifications_update" BEFORE UPDATE ON "notifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_notifications_delete" BEFORE DELETE ON "notifications" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_nui_assets" AS SELECT * FROM "nui_assets" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = nui_assets.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_nui_assets_insert" BEFORE INSERT ON "nui_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = NEW.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_assets_update" BEFORE UPDATE ON "nui_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = OLD.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = NEW.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_assets_delete" BEFORE DELETE ON "nui_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = OLD.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_nui_profiles" AS SELECT * FROM "nui_profiles" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((nui_profiles.user_id = (SELECT user_id FROM _request_context WHERE id=1))));

CREATE TRIGGER "authorize_nui_profiles_insert" BEFORE INSERT ON "nui_profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_profiles_update" BEFORE UPDATE ON "nui_profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_profiles_delete" BEFORE DELETE ON "nui_profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_nui_scans" AS SELECT * FROM "nui_scans" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((nui_scans.user_id = (SELECT user_id FROM _request_context WHERE id=1))));

CREATE TRIGGER "authorize_nui_scans_insert" BEFORE INSERT ON "nui_scans" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_scans_update" BEFORE UPDATE ON "nui_scans" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_nui_scans_delete" BEFORE DELETE ON "nui_scans" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.user_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_order_items" AS SELECT * FROM "order_items" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1))))) OR (order_items.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))));

CREATE TRIGGER "authorize_order_items_insert" BEFORE INSERT ON "order_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_order_items_update" BEFORE UPDATE ON "order_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_order_items_delete" BEFORE DELETE ON "order_items" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_order_status_history" AS SELECT * FROM "order_status_history" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_status_history.order_id) AND ((o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_order_status_history_insert" BEFORE INSERT ON "order_status_history" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_order_status_history_update" BEFORE UPDATE ON "order_status_history" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_order_status_history_delete" BEFORE DELETE ON "order_status_history" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_orders" AS SELECT * FROM "orders" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = orders.buyer_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))) OR EXISTS(SELECT 1 FROM order_items AS _item WHERE _item.order_id=orders.id AND _item.creator_id=(SELECT user_id FROM _request_context WHERE id=1))));

CREATE TRIGGER "authorize_orders_insert" BEFORE INSERT ON "orders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_orders_update" BEFORE UPDATE ON "orders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_orders_delete" BEFORE DELETE ON "orders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_payout_accounts" AS SELECT * FROM "payout_accounts" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = payout_accounts.creator_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_payout_accounts_insert" BEFORE INSERT ON "payout_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.creator_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_payout_accounts_update" BEFORE UPDATE ON "payout_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.creator_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.creator_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_payout_accounts_delete" BEFORE DELETE ON "payout_accounts" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.creator_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_payout_requests" AS SELECT * FROM "payout_requests" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = payout_requests.creator_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))));

CREATE TRIGGER "authorize_payout_requests_insert" BEFORE INSERT ON "payout_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.creator_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_payout_requests_update" BEFORE UPDATE ON "payout_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = OLD.creator_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.creator_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_payout_requests_delete" BEFORE DELETE ON "payout_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = OLD.creator_id) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_print_job_events" AS SELECT * FROM "print_job_events" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (EXISTS ( SELECT 1
   FROM (print_jobs j
     JOIN orders o ON ((o.id = j.order_id)))
  WHERE ((j.id = print_job_events.print_job_id) AND (o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)))))) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_print_job_events_insert" BEFORE INSERT ON "print_job_events" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_job_events_update" BEFORE UPDATE ON "print_job_events" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_job_events_delete" BEFORE DELETE ON "print_job_events" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_print_jobs" AS SELECT * FROM "print_jobs" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = print_jobs.order_id) AND (o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)))))) OR (EXISTS ( SELECT 1
   FROM (work_variants v
     JOIN works w ON ((w.id = v.work_id)))
  WHERE ((v.id = print_jobs.variant_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_print_jobs_insert" BEFORE INSERT ON "print_jobs" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_jobs_update" BEFORE UPDATE ON "print_jobs" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_jobs_delete" BEFORE DELETE ON "print_jobs" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_print_pricing_rules" AS SELECT * FROM "print_pricing_rules" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_print_pricing_rules_insert" BEFORE INSERT ON "print_pricing_rules" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_pricing_rules_update" BEFORE UPDATE ON "print_pricing_rules" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_print_pricing_rules_delete" BEFORE DELETE ON "print_pricing_rules" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_printers" AS SELECT * FROM "printers" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_printers_insert" BEFORE INSERT ON "printers" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_printers_update" BEFORE UPDATE ON "printers" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_printers_delete" BEFORE DELETE ON "printers" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_profiles" AS SELECT * FROM "profiles" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true));

CREATE TRIGGER "authorize_profiles_insert" BEFORE INSERT ON "profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_profiles_update" BEFORE UPDATE ON "profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_profiles_delete" BEFORE DELETE ON "profiles" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_qc_check_definitions" AS SELECT * FROM "qc_check_definitions" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_qc_check_definitions_insert" BEFORE INSERT ON "qc_check_definitions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_check_definitions_update" BEFORE UPDATE ON "qc_check_definitions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_check_definitions_delete" BEFORE DELETE ON "qc_check_definitions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_qc_check_results" AS SELECT * FROM "qc_check_results" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (EXISTS ( SELECT 1
   FROM revision_requests r
  WHERE ((r.inspection_id = qc_check_results.inspection_id) AND (r.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_qc_check_results_insert" BEFORE INSERT ON "qc_check_results" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_check_results_update" BEFORE UPDATE ON "qc_check_results" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_check_results_delete" BEFORE DELETE ON "qc_check_results" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_qc_inspections" AS SELECT * FROM "qc_inspections" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (EXISTS ( SELECT 1
   FROM revision_requests r
  WHERE ((r.inspection_id = qc_inspections.id) AND (r.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_qc_inspections_insert" BEFORE INSERT ON "qc_inspections" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_inspections_update" BEFORE UPDATE ON "qc_inspections" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qc_inspections_delete" BEFORE DELETE ON "qc_inspections" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_qna_threads" AS SELECT * FROM "qna_threads" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true));

CREATE TRIGGER "authorize_qna_threads_insert" BEFORE INSERT ON "qna_threads" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.asker_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qna_threads_update" BEFORE UPDATE ON "qna_threads" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_qna_threads_delete" BEFORE DELETE ON "qna_threads" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_reviews" AS SELECT * FROM "reviews" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (true));

CREATE TRIGGER "authorize_reviews_insert" BEFORE INSERT ON "reviews" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((((SELECT user_id FROM _request_context WHERE id=1) = NEW.reviewer_id) AND (EXISTS ( SELECT 1
   FROM (order_items oi
     JOIN orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.id = NEW.order_item_id) AND (o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)) AND (o.status = 'completed'))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_reviews_update" BEFORE UPDATE ON "reviews" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_reviews_delete" BEFORE DELETE ON "reviews" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(0,0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_revision_requests" AS SELECT * FROM "revision_requests" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (revision_requests.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))));

CREATE TRIGGER "authorize_revision_requests_insert" BEFORE INSERT ON "revision_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_revision_requests_update" BEFORE UPDATE ON "revision_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (OLD.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (NEW.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_revision_requests_delete" BEFORE DELETE ON "revision_requests" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_shipments" AS SELECT * FROM "shipments" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (EXISTS(SELECT 1 FROM order_items AS _item WHERE _item.order_id=shipments.order_id AND _item.creator_id=(SELECT user_id FROM _request_context WHERE id=1)) OR ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = shipments.order_id) AND (o.buyer_id = (SELECT user_id FROM _request_context WHERE id=1)))))) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))));

CREATE TRIGGER "authorize_shipments_insert" BEFORE INSERT ON "shipments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_shipments_update" BEFORE UPDATE ON "shipments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_shipments_delete" BEFORE DELETE ON "shipments" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_tags" AS SELECT * FROM "tags" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')) OR true));

CREATE TRIGGER "authorize_tags_insert" BEFORE INSERT ON "tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_tags_update" BEFORE UPDATE ON "tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_tags_delete" BEFORE DELETE ON "tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_tryon_renders" AS SELECT * FROM "tryon_renders" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = tryon_renders.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1)))))));

CREATE TRIGGER "authorize_tryon_renders_insert" BEFORE INSERT ON "tryon_renders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = NEW.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_tryon_renders_update" BEFORE UPDATE ON "tryon_renders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = OLD.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = NEW.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_tryon_renders_delete" BEFORE DELETE ON "tryon_renders" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM nui_profiles p
  WHERE ((p.id = OLD.nui_id) AND (p.user_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_user_nui_sizes" AS SELECT * FROM "user_nui_sizes" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = user_nui_sizes.user_id)));

CREATE TRIGGER "authorize_user_nui_sizes_insert" BEFORE INSERT ON "user_nui_sizes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_user_nui_sizes_update" BEFORE UPDATE ON "user_nui_sizes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_user_nui_sizes_delete" BEFORE DELETE ON "user_nui_sizes" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_ar_assets" AS SELECT * FROM "work_ar_assets" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_ar_assets.work_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_ar_assets.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_ar_assets_insert" BEFORE INSERT ON "work_ar_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_ar_assets_update" BEFORE UPDATE ON "work_ar_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_ar_assets_delete" BEFORE DELETE ON "work_ar_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_assembly" AS SELECT * FROM "work_assembly" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_assembly.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_assembly_insert" BEFORE INSERT ON "work_assembly" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_assembly_update" BEFORE UPDATE ON "work_assembly" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_assembly_delete" BEFORE DELETE ON "work_assembly" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_asset_objects" AS SELECT * FROM "work_asset_objects" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_asset_objects.asset_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))) OR (EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_asset_objects.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_asset_objects_insert" BEFORE INSERT ON "work_asset_objects" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = NEW.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_asset_objects_update" BEFORE UPDATE ON "work_asset_objects" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = OLD.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = NEW.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_asset_objects_delete" BEFORE DELETE ON "work_asset_objects" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = OLD.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_assets" AS SELECT * FROM "work_assets" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_assets.work_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_assets.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_assets_insert" BEFORE INSERT ON "work_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_assets_update" BEFORE UPDATE ON "work_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_assets_delete" BEFORE DELETE ON "work_assets" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_color_slots" AS SELECT * FROM "work_color_slots" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_color_slots.work_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_color_slots.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_color_slots_insert" BEFORE INSERT ON "work_color_slots" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_color_slots_update" BEFORE UPDATE ON "work_color_slots" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_color_slots_delete" BEFORE DELETE ON "work_color_slots" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_favorites" AS SELECT * FROM "work_favorites" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = work_favorites.user_id)));

CREATE TRIGGER "authorize_work_favorites_insert" BEFORE INSERT ON "work_favorites" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_favorites_update" BEFORE UPDATE ON "work_favorites" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = NEW.user_id))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_favorites_delete" BEFORE DELETE ON "work_favorites" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((SELECT user_id FROM _request_context WHERE id=1) = OLD.user_id))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_images" AS SELECT * FROM "work_images" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_images.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_images.work_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_images_insert" BEFORE INSERT ON "work_images" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_images_update" BEFORE UPDATE ON "work_images" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_images_delete" BEFORE DELETE ON "work_images" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_part_instructions" AS SELECT * FROM "work_part_instructions" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_part_instructions.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_part_instructions_insert" BEFORE INSERT ON "work_part_instructions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_part_instructions_update" BEFORE UPDATE ON "work_part_instructions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_part_instructions_delete" BEFORE DELETE ON "work_part_instructions" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_tags" AS SELECT * FROM "work_tags" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_tags.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_tags.work_id) AND ((w.status = 'published') OR (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_tags_insert" BEFORE INSERT ON "work_tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_tags_update" BEFORE UPDATE ON "work_tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_tags_delete" BEFORE DELETE ON "work_tags" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND (w.creator_id = (SELECT user_id FROM _request_context WHERE id=1))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_validation_issues" AS SELECT * FROM "work_validation_issues" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = work_validation_issues.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_validation_issues_insert" BEFORE INSERT ON "work_validation_issues" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = NEW.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_validation_issues_update" BEFORE UPDATE ON "work_validation_issues" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = OLD.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = NEW.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_validation_issues_delete" BEFORE DELETE ON "work_validation_issues" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM (work_assets a
     JOIN works w ON ((w.id = a.work_id)))
  WHERE ((a.id = OLD.asset_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_work_variants" AS SELECT * FROM "work_variants" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((work_variants.is_listed OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_variants.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))) OR EXISTS(SELECT 1 FROM custom_order_quotes AS _quote WHERE _quote.variant_id=work_variants.id AND _quote.buyer_id=(SELECT user_id FROM _request_context WHERE id=1) AND _quote.status IN ('accepted','ordered')) OR (EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = work_variants.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))))))));

CREATE TRIGGER "authorize_work_variants_insert" BEFORE INSERT ON "work_variants" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_variants_update" BEFORE UPDATE ON "work_variants" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = NEW.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_work_variants_delete" BEFORE DELETE ON "work_variants" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((EXISTS ( SELECT 1
   FROM works w
  WHERE ((w.id = OLD.work_id) AND ((w.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin')))))))),0) THEN RAISE(IGNORE) END;
END;

CREATE VIEW "visible_works" AS SELECT * FROM "works" WHERE (SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0 OR ((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND (((works.status = 'published') OR (works.creator_id = (SELECT user_id FROM _request_context WHERE id=1)) OR (EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=(SELECT user_id FROM _request_context WHERE id=1) AND _admin.role='admin'))) OR EXISTS(SELECT 1 FROM custom_order_quotes AS _quote JOIN work_variants AS _variant ON _variant.id=_quote.variant_id WHERE _variant.work_id=works.id AND _quote.buyer_id=(SELECT user_id FROM _request_context WHERE id=1) AND _quote.status IN ('accepted','ordered'))));

CREATE TRIGGER "authorize_works_insert" BEFORE INSERT ON "works" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_works_update" BEFORE UPDATE ON "works" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((NEW.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(ABORT,'permission denied') END;
END;

CREATE TRIGGER "authorize_works_delete" BEFORE DELETE ON "works" WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0) BEGIN
  SELECT CASE WHEN NOT coalesce(((SELECT role FROM _request_context WHERE id=1) IN ('app_guest','app_user') AND ((OLD.creator_id = (SELECT user_id FROM _request_context WHERE id=1)))),0) THEN RAISE(IGNORE) END;
END;

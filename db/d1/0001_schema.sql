-- D1 / SQLite schema. Source catalog: db/oracle/postgres.json (3248d66).

PRAGMA defer_foreign_keys = ON;

CREATE TABLE _request_context (id INTEGER PRIMARY KEY CHECK(id=1), role TEXT NOT NULL DEFAULT 'app_guest', user_id TEXT, internal_depth INTEGER NOT NULL DEFAULT 0 CHECK(internal_depth>=0));

INSERT INTO _request_context(id) VALUES(1);

CREATE TABLE _assertion (ok INTEGER NOT NULL CHECK(ok=1));

CREATE TABLE "addresses" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "recipient_name" TEXT NOT NULL,
  "postal_code" TEXT NOT NULL,
  "prefecture" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "address_line" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "is_default" INTEGER NOT NULL DEFAULT (false) CHECK("is_default" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "addresses_pkey" PRIMARY KEY (id),
  CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "app_users" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "name" TEXT NOT NULL DEFAULT (''),
  "email" TEXT NOT NULL,
  "email_verified" INTEGER NOT NULL DEFAULT (false) CHECK("email_verified" IN (0,1)),
  "image" TEXT,
  "phone" TEXT,
  "phone_verified" INTEGER DEFAULT (false) CHECK("phone_verified" IN (0,1)),
  "phone_confirmed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "is_anonymous" INTEGER NOT NULL DEFAULT (false) CHECK("is_anonymous" IN (0,1)),
  CONSTRAINT "app_users_email_key" UNIQUE (email),
  CONSTRAINT "app_users_phone_key" UNIQUE (phone),
  CONSTRAINT "app_users_pkey" PRIMARY KEY (id)
);

CREATE TABLE "auth_accounts" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TEXT,
  "refresh_token_expires_at" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "auth_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "auth_accounts_provider_id_account_id_key" UNIQUE (provider_id, account_id),
  CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE "auth_rate_limits" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "last_request" INTEGER NOT NULL,
  CONSTRAINT "auth_rate_limits_key_key" UNIQUE (key),
  CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY (id)
);

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "auth_sessions_token_key" UNIQUE (token),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE "auth_verifications" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "auth_verifications_pkey" PRIMARY KEY (id)
);

CREATE TABLE "cart_items" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "cart_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT (1),
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "variant_id" TEXT NOT NULL,
  CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT "cart_items_cart_id_variant_id_key" UNIQUE (cart_id, variant_id),
  CONSTRAINT "cart_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "cart_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE CASCADE
);

CREATE TABLE "carts" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "carts_pkey" PRIMARY KEY (id),
  CONSTRAINT "carts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "carts_user_id_key" UNIQUE (user_id)
);

CREATE TABLE "coordinate_post_pins" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "post_id" TEXT NOT NULL,
  "work_id" TEXT NOT NULL,
  "x_percent" REAL NOT NULL,
  "y_percent" REAL NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "coordinate_post_pins_pkey" PRIMARY KEY (id),
  CONSTRAINT "coordinate_post_pins_post_id_fkey" FOREIGN KEY (post_id) REFERENCES coordinate_posts(id) ON DELETE CASCADE,
  CONSTRAINT "coordinate_post_pins_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  CONSTRAINT "coordinate_post_pins_x_percent_check" CHECK (((x_percent >= (0)) AND (x_percent <= (100)))),
  CONSTRAINT "coordinate_post_pins_y_percent_check" CHECK (((y_percent >= (0)) AND (y_percent <= (100))))
);

CREATE TABLE "coordinate_posts" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "image_storage_path" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT (''),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "coordinate_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "coordinate_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "creator_applications" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT ('pending') CHECK("status" IN ('pending','approved','rejected')),
  "message" TEXT DEFAULT (''),
  "admin_note" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "phone" TEXT,
  "phone_verified_at" TEXT,
  "terms_version" TEXT,
  "terms_agreed_at" TEXT,
  "portfolio_url" TEXT,
  CONSTRAINT "creator_applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "creator_applications_portfolio_url_check" CHECK (((portfolio_url IS NULL) OR ((lower(portfolio_url) LIKE 'http://%' OR lower(portfolio_url) LIKE 'https://%')))),
  CONSTRAINT "creator_applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "creator_applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "creator_follows" (
  "follower_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "creator_follows_check" CHECK ((follower_id <> creator_id)),
  CONSTRAINT "creator_follows_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "creator_follows_follower_id_fkey" FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "creator_follows_pkey" PRIMARY KEY (follower_id, creator_id)
);

CREATE TABLE "custom_order_quotes" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "quote_no" TEXT,
  "request_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "buyer_id" TEXT NOT NULL,
  "base_work_id" TEXT,
  "status" TEXT NOT NULL DEFAULT ('draft') CHECK("status" IN ('draft','sent','accepted','ordered','revision','declined','expired')),
  "spec" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("spec")),
  "asset_id" TEXT,
  "est_filament_grams" REAL,
  "est_print_hours" REAL,
  "part_count" INTEGER NOT NULL DEFAULT (1),
  "max_part_bbox_x_mm" REAL,
  "max_part_bbox_y_mm" REAL,
  "max_part_bbox_z_mm" REAL,
  "price_jpy" INTEGER NOT NULL,
  "print_fee_jpy" INTEGER NOT NULL DEFAULT (0),
  "shipping_fee_jpy" INTEGER NOT NULL DEFAULT (0),
  "lead_time_days" INTEGER NOT NULL DEFAULT (10),
  "note" TEXT,
  "expires_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days')),
  "variant_id" TEXT,
  "accepted_at" TEXT,
  "ordered_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "custom_order_quotes_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES work_assets(id) ON DELETE SET NULL,
  CONSTRAINT "custom_order_quotes_base_work_id_fkey" FOREIGN KEY (base_work_id) REFERENCES works(id) ON DELETE SET NULL,
  CONSTRAINT "custom_order_quotes_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  CONSTRAINT "custom_order_quotes_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  CONSTRAINT "custom_order_quotes_lead_time_days_check" CHECK ((lead_time_days > 0)),
  CONSTRAINT "custom_order_quotes_part_count_check" CHECK ((part_count > 0)),
  CONSTRAINT "custom_order_quotes_pkey" PRIMARY KEY (id),
  CONSTRAINT "custom_order_quotes_price_jpy_check" CHECK ((price_jpy >= 0)),
  CONSTRAINT "custom_order_quotes_print_fee_jpy_check" CHECK ((print_fee_jpy >= 0)),
  CONSTRAINT "custom_order_quotes_quote_no_key" UNIQUE (quote_no),
  CONSTRAINT "custom_order_quotes_request_id_fkey" FOREIGN KEY (request_id) REFERENCES custom_order_requests(id) ON DELETE CASCADE,
  CONSTRAINT "custom_order_quotes_shipping_fee_jpy_check" CHECK ((shipping_fee_jpy >= 0)),
  CONSTRAINT "custom_order_quotes_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE SET NULL
);

CREATE TABLE "custom_order_requests" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "requester_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "reference_work_id" TEXT,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT ('pending') CHECK("status" IN ('pending','responded','accepted','declined')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "custom_order_requests_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "custom_order_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "custom_order_requests_reference_work_id_fkey" FOREIGN KEY (reference_work_id) REFERENCES works(id) ON DELETE SET NULL,
  CONSTRAINT "custom_order_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "filament_ledger" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "filament_id" TEXT NOT NULL,
  "delta_grams" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "print_job_id" TEXT,
  "actor_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "filament_ledger_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "filament_ledger_filament_id_fkey" FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT,
  CONSTRAINT "filament_ledger_pkey" PRIMARY KEY (id),
  CONSTRAINT "filament_ledger_print_job_id_fkey" FOREIGN KEY (print_job_id) REFERENCES print_jobs(id) ON DELETE SET NULL
);

CREATE TABLE "filaments" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "material" TEXT NOT NULL CHECK("material" IN ('PLA','PETG','ABS','TPU')),
  "color_name" TEXT NOT NULL,
  "color_hex" TEXT NOT NULL,
  "stock_grams" INTEGER NOT NULL DEFAULT (0),
  "price_per_gram" REAL NOT NULL DEFAULT (3.50),
  "is_active" INTEGER NOT NULL DEFAULT (true) CHECK("is_active" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "filaments_color_hex_check" CHECK (((length(color_hex)=7 AND substr(color_hex,1,1)='#' AND substr(color_hex,2) NOT GLOB '*[^0-9A-Fa-f]*'))),
  CONSTRAINT "filaments_material_color_name_key" UNIQUE (material, color_name),
  CONSTRAINT "filaments_pkey" PRIMARY KEY (id),
  CONSTRAINT "filaments_stock_grams_check" CHECK ((stock_grams >= 0))
);

CREATE TABLE "messages" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "order_id" TEXT,
  "sender_id" TEXT NOT NULL,
  "recipient_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "messages_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "notification_preferences" (
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK("kind" IN ('order_shipping','favorite_price','message','review','creator','announcement')),
  "in_app" INTEGER NOT NULL DEFAULT (true) CHECK("in_app" IN (0,1)),
  "email" INTEGER NOT NULL DEFAULT (true) CHECK("email" IN (0,1)),
  "push" INTEGER NOT NULL DEFAULT (false) CHECK("push" IN (0,1)),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "mandatory_kinds_stay_in_app" CHECK (((kind NOT IN ('order_shipping', 'creator')) OR in_app)),
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (user_id, kind),
  CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "notification_settings" (
  "user_id" TEXT NOT NULL,
  "email_to" TEXT,
  "digest" TEXT NOT NULL DEFAULT ('instant') CHECK("digest" IN ('instant','daily')),
  "digest_hour" INTEGER NOT NULL DEFAULT (20),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "notification_settings_digest_hour_check" CHECK (((digest_hour >= 0) AND (digest_hour <= 23))),
  CONSTRAINT "notification_settings_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "kind" TEXT NOT NULL CHECK("kind" IN ('order_shipping','favorite_price','message','review','creator','announcement')),
  "title" TEXT NOT NULL,
  "body" TEXT,
  "link_path" TEXT NOT NULL,
  "source_table" TEXT,
  "source_id" TEXT,
  "emailed_at" TEXT,
  "pushed_at" TEXT,
  "email_claim_token" TEXT,
  "email_claimed_until" TEXT,
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "nui_assets" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "scan_id" TEXT,
  "nui_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nui_assets_bytes_check" CHECK ((bytes >= 0)),
  CONSTRAINT "nui_assets_kind_check" CHECK ((kind IN ('photo', 'model_glb', 'cutout_png', 'thumbnail'))),
  CONSTRAINT "nui_assets_nui_id_fkey" FOREIGN KEY (nui_id) REFERENCES nui_profiles(id) ON DELETE CASCADE,
  CONSTRAINT "nui_assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "nui_assets_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES nui_scans(id) ON DELETE CASCADE
);

CREATE TABLE "nui_profiles" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT ('plush') CHECK("kind" IN ('plush','acrylic_stand','figure','other')),
  "sit_height_mm" REAL,
  "shoulder_width_mm" REAL,
  "hug_width_mm" REAL,
  "nui_size_cm" REAL,
  "is_main" INTEGER NOT NULL DEFAULT (false) CHECK("is_main" IN (0,1)),
  "has_scan" INTEGER NOT NULL DEFAULT (false) CHECK("has_scan" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "height_mm" REAL NOT NULL,
  CONSTRAINT "nui_profiles_height_mm_check" CHECK ((height_mm > (0))),
  CONSTRAINT "nui_profiles_hug_width_mm_check" CHECK ((hug_width_mm > (0))),
  CONSTRAINT "nui_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "nui_profiles_shoulder_width_mm_check" CHECK ((shoulder_width_mm > (0))),
  CONSTRAINT "nui_profiles_sit_height_mm_check" CHECK ((sit_height_mm > (0))),
  CONSTRAINT "nui_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "nui_scans" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "nui_id" TEXT,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT ('astra'),
  "external_session_id" TEXT,
  "shot_count" INTEGER NOT NULL DEFAULT (0),
  "status" TEXT NOT NULL DEFAULT ('capturing') CHECK("status" IN ('capturing','generating','ready','failed')),
  "duration_ms" INTEGER,
  "error_message" TEXT,
  "measured_sit_height_mm" REAL,
  "measured_shoulder_width_mm" REAL,
  "measured_hug_width_mm" REAL,
  "measure_confidence" REAL,
  "photos_expire_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  CONSTRAINT "nui_scans_duration_ms_check" CHECK ((duration_ms >= 0)),
  CONSTRAINT "nui_scans_measure_confidence_check" CHECK (((measure_confidence >= (0)) AND (measure_confidence <= (1)))),
  CONSTRAINT "nui_scans_nui_id_fkey" FOREIGN KEY (nui_id) REFERENCES nui_profiles(id) ON DELETE CASCADE,
  CONSTRAINT "nui_scans_pkey" PRIMARY KEY (id),
  CONSTRAINT "nui_scans_shot_count_check" CHECK ((shot_count >= 0)),
  CONSTRAINT "nui_scans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "order_items" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "order_id" TEXT NOT NULL,
  "work_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "unit_price" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "creator_payout_amount" INTEGER NOT NULL,
  "platform_fee_amount" INTEGER NOT NULL,
  "print_cost_amount" INTEGER NOT NULL,
  "stl_storage_path_snapshot" TEXT NOT NULL,
  "filament_material_snapshot" TEXT NOT NULL,
  "filament_color_snapshot" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "variant_id" TEXT,
  "size_label_snapshot" TEXT,
  "print_fee_snapshot" INTEGER,
  "color_slots_snapshot" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("color_slots_snapshot")),
  "part_instructions_snapshot" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("part_instructions_snapshot")),
  "print_assets_snapshot" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("print_assets_snapshot")),
  CONSTRAINT "order_items_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_items_print_assets_snapshot_check" CHECK ((json_type(print_assets_snapshot) = 'array')),
  CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE RESTRICT,
  CONSTRAINT "order_items_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE RESTRICT
);

CREATE TABLE "order_status_history" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "order_id" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK("status" IN ('payment_pending','paid','printing_queued','printing','packaging','shipped','completed','cancelled','refunded')),
  "note" TEXT,
  "changed_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY (id)
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "buyer_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT ('payment_pending') CHECK("status" IN ('payment_pending','paid','printing_queued','printing','packaging','shipped','completed','cancelled','refunded')),
  "subtotal_amount" INTEGER NOT NULL,
  "platform_fee_amount" INTEGER NOT NULL DEFAULT (0),
  "print_cost_amount" INTEGER NOT NULL DEFAULT (0),
  "total_amount" INTEGER NOT NULL,
  "shipping_address_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "tracking_number" TEXT,
  "shipped_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ship_due_at" TEXT,
  "gift_wrapping" INTEGER NOT NULL DEFAULT (false) CHECK("gift_wrapping" IN (0,1)),
  "shipping_fee_amount" INTEGER NOT NULL DEFAULT (0),
  "platform_fee_rate" REAL,
  "checkout_started_at" TEXT,
  "stripe_checkout_session_id" TEXT,
  "is_demo" INTEGER NOT NULL DEFAULT (false) CHECK("is_demo" IN (0,1)),
  "checkout_request_id" TEXT,
  CONSTRAINT "orders_buyer_checkout_request_key" UNIQUE (buyer_id, checkout_request_id),
  CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_platform_fee_rate_check" CHECK (((platform_fee_rate >= (0)) AND (platform_fee_rate < (1)))),
  CONSTRAINT "orders_shipping_address_id_fkey" FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
  CONSTRAINT "orders_shipping_fee_amount_check" CHECK ((shipping_fee_amount >= 0)),
  CONSTRAINT "orders_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id)
);

CREATE TABLE "payout_accounts" (
  "creator_id" TEXT NOT NULL,
  "bank_name" TEXT NOT NULL,
  "branch_name" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_holder_name" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "payout_accounts_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "payout_accounts_pkey" PRIMARY KEY (creator_id)
);

CREATE TABLE "payout_requests" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "creator_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT ('requested') CHECK("status" IN ('requested','processing','paid','rejected')),
  "requested_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "processed_at" TEXT,
  CONSTRAINT "payout_requests_amount_check" CHECK ((amount > 0)),
  CONSTRAINT "payout_requests_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "payout_requests_pkey" PRIMARY KEY (id)
);

CREATE TABLE "print_job_events" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "print_job_id" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK("status" IN ('queued','printing','printed','qc_passed','qc_failed','reprinting','cancelled')),
  "actor_id" TEXT,
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "print_job_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "print_job_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "print_job_events_print_job_id_fkey" FOREIGN KEY (print_job_id) REFERENCES print_jobs(id) ON DELETE CASCADE
);

CREATE TABLE "print_jobs" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "job_no" TEXT,
  "order_id" TEXT NOT NULL,
  "order_item_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "status" TEXT NOT NULL DEFAULT ('queued') CHECK("status" IN ('queued','printing','printed','qc_passed','qc_failed','reprinting','cancelled')),
  "printer_id" TEXT,
  "assignee_id" TEXT,
  "due_at" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT (1),
  "part_count" INTEGER NOT NULL DEFAULT (1),
  "batch_count" INTEGER NOT NULL DEFAULT (1),
  "batch_done" INTEGER NOT NULL DEFAULT (0),
  "est_filament_grams" REAL,
  "est_print_hours" REAL,
  "print_fee_snapshot" INTEGER,
  "actual_filament_grams" REAL,
  "actual_print_hours" REAL,
  "failure_count" INTEGER NOT NULL DEFAULT (0),
  "started_at" TEXT,
  "finished_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "print_jobs_actual_filament_grams_check" CHECK ((actual_filament_grams >= (0))),
  CONSTRAINT "print_jobs_actual_print_hours_check" CHECK ((actual_print_hours >= (0))),
  CONSTRAINT "print_jobs_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "print_jobs_batch_count_check" CHECK ((batch_count > 0)),
  CONSTRAINT "print_jobs_batch_done_check" CHECK ((batch_done >= 0)),
  CONSTRAINT "print_jobs_batch_done_within_count" CHECK ((batch_done <= batch_count)),
  CONSTRAINT "print_jobs_failure_count_check" CHECK ((failure_count >= 0)),
  CONSTRAINT "print_jobs_job_no_key" UNIQUE (job_no),
  CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT "print_jobs_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT "print_jobs_part_count_check" CHECK ((part_count > 0)),
  CONSTRAINT "print_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE SET NULL,
  CONSTRAINT "print_jobs_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "print_jobs_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE SET NULL
);

CREATE TABLE "print_pricing_rules" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "effective_from" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "material_yen_per_gram" REAL NOT NULL DEFAULT (3.50),
  "machine_yen_per_hour" REAL NOT NULL DEFAULT (75.00),
  "handling_base_yen" INTEGER NOT NULL DEFAULT (0),
  "handling_per_part_yen" INTEGER NOT NULL DEFAULT (20),
  "platform_fee_rate" REAL NOT NULL DEFAULT (0.100),
  "bed_x_mm" INTEGER NOT NULL DEFAULT (220),
  "bed_y_mm" INTEGER NOT NULL DEFAULT (220),
  "bed_z_mm" INTEGER NOT NULL DEFAULT (250),
  "max_batch_hours" REAL NOT NULL DEFAULT (24.0),
  "is_active" INTEGER NOT NULL DEFAULT (true) CHECK("is_active" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "fee_billing" TEXT NOT NULL DEFAULT ('separate') CHECK("fee_billing" IN ('bundled','separate')),
  "shipping_fee_jpy" INTEGER NOT NULL DEFAULT (520),
  CONSTRAINT "print_pricing_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "print_pricing_rules_platform_fee_rate_check" CHECK (((platform_fee_rate >= (0)) AND (platform_fee_rate < (1)))),
  CONSTRAINT "print_pricing_rules_shipping_fee_jpy_check" CHECK ((shipping_fee_jpy >= 0))
);

CREATE TABLE "printers" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "code" TEXT NOT NULL,
  "model_name" TEXT NOT NULL,
  "bed_x_mm" INTEGER NOT NULL DEFAULT (220),
  "bed_y_mm" INTEGER NOT NULL DEFAULT (220),
  "bed_z_mm" INTEGER NOT NULL DEFAULT (250),
  "nozzle_mm" REAL NOT NULL DEFAULT (0.40),
  "supports_multicolor" INTEGER NOT NULL DEFAULT (false) CHECK("supports_multicolor" IN (0,1)),
  "is_active" INTEGER NOT NULL DEFAULT (true) CHECK("is_active" IN (0,1)),
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "printers_code_key" UNIQUE (code),
  CONSTRAINT "printers_pkey" PRIMARY KEY (id)
);

CREATE TABLE "profiles" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT ('buyer') CHECK("role" IN ('buyer','creator','admin')),
  "display_name" TEXT NOT NULL,
  "avatar_url" TEXT,
  "bio" TEXT,
  "sns_links" TEXT NOT NULL DEFAULT ('{}') CHECK(json_valid("sns_links")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "role_before_admin" TEXT CHECK("role_before_admin" IN ('buyer','creator','admin')),
  CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

CREATE TABLE "qc_check_definitions" (
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT (0),
  "is_active" INTEGER NOT NULL DEFAULT (true) CHECK("is_active" IN (0,1)),
  CONSTRAINT "qc_check_definitions_pkey" PRIMARY KEY (code)
);

CREATE TABLE "qc_check_results" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "inspection_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "passed" INTEGER NOT NULL CHECK("passed" IN (0,1)),
  "note" TEXT,
  CONSTRAINT "qc_check_results_code_fkey" FOREIGN KEY (code) REFERENCES qc_check_definitions(code) ON DELETE RESTRICT,
  CONSTRAINT "qc_check_results_inspection_id_code_key" UNIQUE (inspection_id, code),
  CONSTRAINT "qc_check_results_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES qc_inspections(id) ON DELETE CASCADE,
  CONSTRAINT "qc_check_results_pkey" PRIMARY KEY (id)
);

CREATE TABLE "qc_inspections" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "print_job_id" TEXT NOT NULL,
  "inspector_id" TEXT,
  "result" TEXT NOT NULL CHECK("result" IN ('passed','failed')),
  "memo" TEXT,
  "photo_paths" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("photo_paths")) CHECK(json_type("photo_paths")='array'),
  "reprint_cause" TEXT CHECK("reprint_cause" IN ('model','print','material','handling')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "qc_failed_requires_cause" CHECK (((result = 'passed') OR (reprint_cause IS NOT NULL))),
  CONSTRAINT "qc_inspections_inspector_id_fkey" FOREIGN KEY (inspector_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "qc_inspections_pkey" PRIMARY KEY (id),
  CONSTRAINT "qc_inspections_print_job_id_fkey" FOREIGN KEY (print_job_id) REFERENCES print_jobs(id) ON DELETE CASCADE
);

CREATE TABLE "qna_threads" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "asker_id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "answered_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "qna_threads_asker_id_fkey" FOREIGN KEY (asker_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "qna_threads_pkey" PRIMARY KEY (id),
  CONSTRAINT "qna_threads_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "reviews" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "order_item_id" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "work_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "photo_storage_path" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "design_rating" INTEGER,
  "accuracy_rating" INTEGER,
  "size_fit_rating" INTEGER,
  "print_quality_rating" INTEGER,
  "packaging_rating" INTEGER,
  "shipping_rating" INTEGER,
  "is_anonymous" INTEGER NOT NULL DEFAULT (false) CHECK("is_anonymous" IN (0,1)),
  CONSTRAINT "reviews_accuracy_rating_check" CHECK (((accuracy_rating >= 1) AND (accuracy_rating <= 5))),
  CONSTRAINT "reviews_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "reviews_design_rating_check" CHECK (((design_rating >= 1) AND (design_rating <= 5))),
  CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT "reviews_order_item_id_key" UNIQUE (order_item_id),
  CONSTRAINT "reviews_packaging_rating_check" CHECK (((packaging_rating >= 1) AND (packaging_rating <= 5))),
  CONSTRAINT "reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "reviews_print_quality_rating_check" CHECK (((print_quality_rating >= 1) AND (print_quality_rating <= 5))),
  CONSTRAINT "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "reviews_shipping_rating_check" CHECK (((shipping_rating >= 1) AND (shipping_rating <= 5))),
  CONSTRAINT "reviews_size_fit_rating_check" CHECK (((size_fit_rating >= 1) AND (size_fit_rating <= 5))),
  CONSTRAINT "reviews_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "revision_requests" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "revision_no" TEXT,
  "work_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "creator_id" TEXT NOT NULL,
  "inspection_id" TEXT,
  "print_job_id" TEXT,
  "object_id" TEXT,
  "status" TEXT NOT NULL DEFAULT ('open') CHECK("status" IN ('open','in_progress','resolved','disputed','cancelled')),
  "cause" TEXT NOT NULL DEFAULT ('model') CHECK("cause" IN ('model','print','material','handling')),
  "message" TEXT NOT NULL,
  "photo_paths" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("photo_paths")) CHECK(json_type("photo_paths")='array'),
  "due_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+4 days')),
  "reprint_fee_jpy" INTEGER NOT NULL DEFAULT (0),
  "charged_to_creator" INTEGER NOT NULL DEFAULT (false) CHECK("charged_to_creator" IN (0,1)),
  "resolution" TEXT CHECK("resolution" IN ('reupload','instruction','unlist','no_action')),
  "resolution_note" TEXT,
  "resolved_at" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "revision_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "revision_requests_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "revision_requests_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES qc_inspections(id) ON DELETE SET NULL,
  CONSTRAINT "revision_requests_object_id_fkey" FOREIGN KEY (object_id) REFERENCES work_asset_objects(id) ON DELETE SET NULL,
  CONSTRAINT "revision_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "revision_requests_print_job_id_fkey" FOREIGN KEY (print_job_id) REFERENCES print_jobs(id) ON DELETE SET NULL,
  CONSTRAINT "revision_requests_reprint_fee_jpy_check" CHECK ((reprint_fee_jpy >= 0)),
  CONSTRAINT "revision_requests_revision_no_key" UNIQUE (revision_no),
  CONSTRAINT "revision_requests_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE SET NULL,
  CONSTRAINT "revision_requests_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "shipments" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "order_id" TEXT NOT NULL,
  "carrier" TEXT NOT NULL CHECK("carrier" IN ('yamato','sagawa','japanpost','other')),
  "service_name" TEXT,
  "tracking_number" TEXT,
  "box_type" TEXT,
  "weight_grams" INTEGER,
  "size_sum_cm" INTEGER,
  "shipping_fee_jpy" INTEGER NOT NULL DEFAULT (0),
  "shipped_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "buyer_notified_at" TEXT,
  "packer_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT "shipments_packer_id_fkey" FOREIGN KEY (packer_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "shipments_pkey" PRIMARY KEY (id),
  CONSTRAINT "shipments_shipping_fee_jpy_check" CHECK ((shipping_fee_jpy >= 0)),
  CONSTRAINT "shipments_size_sum_cm_check" CHECK ((size_sum_cm >= 0)),
  CONSTRAINT "shipments_weight_grams_check" CHECK ((weight_grams >= 0))
);

CREATE TABLE "tags" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "type" TEXT NOT NULL CHECK("type" IN ('category','nui_size','worldview')),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT (0),
  CONSTRAINT "tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "tags_type_slug_key" UNIQUE (type, slug)
);

CREATE TABLE "tryon_renders" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "nui_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "view" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "tryon_renders_nui_id_fkey" FOREIGN KEY (nui_id) REFERENCES nui_profiles(id) ON DELETE CASCADE,
  CONSTRAINT "tryon_renders_pkey" PRIMARY KEY (id),
  CONSTRAINT "tryon_renders_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE CASCADE,
  CONSTRAINT "tryon_renders_view_check" CHECK ((view IN ('front', 'angle', 'side', 'scale')))
);

CREATE TABLE "user_nui_sizes" (
  "user_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "user_nui_sizes_pkey" PRIMARY KEY (user_id, tag_id),
  CONSTRAINT "user_nui_sizes_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  CONSTRAINT "user_nui_sizes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "work_ar_assets" (
  "work_id" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_format" TEXT NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_ar_assets_file_format_check" CHECK ((file_format IN ('stl', '3mf', 'blend'))),
  CONSTRAINT "work_ar_assets_file_size_bytes_check" CHECK (((file_size_bytes > 0) AND (file_size_bytes <= 83886080))),
  CONSTRAINT "work_ar_assets_pkey" PRIMARY KEY (work_id),
  CONSTRAINT "work_ar_assets_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_assembly" (
  "work_id" TEXT NOT NULL,
  "diagram_storage_path" TEXT,
  "fit_clearance_mm" REAL,
  "adhesive" TEXT,
  "steps_text" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_assembly_pkey" PRIMARY KEY (work_id),
  CONSTRAINT "work_assembly_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_asset_objects" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "asset_id" TEXT NOT NULL,
  "object_index" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "triangle_count" INTEGER,
  "bbox_x_mm" REAL NOT NULL,
  "bbox_y_mm" REAL NOT NULL,
  "bbox_z_mm" REAL NOT NULL,
  "volume_cm3" REAL NOT NULL,
  "surface_area_cm2" REAL,
  "is_manifold" INTEGER NOT NULL DEFAULT (true) CHECK("is_manifold" IN (0,1)),
  "open_edge_count" INTEGER NOT NULL DEFAULT (0),
  "flipped_normal_count" INTEGER NOT NULL DEFAULT (0),
  "self_intersection_count" INTEGER NOT NULL DEFAULT (0),
  "min_wall_thickness_mm" REAL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_asset_objects_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES work_assets(id) ON DELETE CASCADE,
  CONSTRAINT "work_asset_objects_asset_id_object_index_key" UNIQUE (asset_id, object_index),
  CONSTRAINT "work_asset_objects_pkey" PRIMARY KEY (id)
);

CREATE TABLE "work_assets" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_format" TEXT NOT NULL CHECK("file_format" IN ('3mf','stl')),
  "file_size_bytes" INTEGER NOT NULL,
  "unit" TEXT NOT NULL DEFAULT ('mm'),
  "object_count" INTEGER NOT NULL DEFAULT (1),
  "triangle_count" INTEGER,
  "vertex_count" INTEGER,
  "total_volume_cm3" REAL,
  "total_surface_area_cm2" REAL,
  "bbox_x_mm" REAL,
  "bbox_y_mm" REAL,
  "bbox_z_mm" REAL,
  "validation_status" TEXT NOT NULL DEFAULT ('pending') CHECK("validation_status" IN ('pending','passed','warning','failed')),
  "validated_at" TEXT,
  "is_primary" INTEGER NOT NULL DEFAULT (true) CHECK("is_primary" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_assets_file_size_bytes_check" CHECK ((file_size_bytes > 0)),
  CONSTRAINT "work_assets_object_count_check" CHECK ((object_count > 0)),
  CONSTRAINT "work_assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_assets_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_color_slots" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "slot_index" INTEGER NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_hex" TEXT NOT NULL,
  "face_count" INTEGER,
  "filament_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_color_slots_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES work_assets(id) ON DELETE CASCADE,
  CONSTRAINT "work_color_slots_asset_id_slot_index_key" UNIQUE (asset_id, slot_index),
  CONSTRAINT "work_color_slots_filament_id_fkey" FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT,
  CONSTRAINT "work_color_slots_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_color_slots_slot_index_check" CHECK ((slot_index >= 1)),
  CONSTRAINT "work_color_slots_source_hex_check" CHECK (((length(source_hex)=7 AND substr(source_hex,1,1)='#' AND substr(source_hex,2) NOT GLOB '*[^0-9A-Fa-f]*'))),
  CONSTRAINT "work_color_slots_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_favorites" (
  "user_id" TEXT NOT NULL,
  "work_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_favorites_pkey" PRIMARY KEY (user_id, work_id),
  CONSTRAINT "work_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "work_favorites_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_images" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT (0),
  CONSTRAINT "work_images_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_images_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_part_instructions" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "orientation" TEXT NOT NULL DEFAULT ('flat') CHECK("orientation" IN ('flat','upright','tilted','as_is')),
  "no_rotate" INTEGER NOT NULL DEFAULT (false) CHECK("no_rotate" IN (0,1)),
  "support" TEXT NOT NULL DEFAULT ('none') CHECK("support" IN ('none','auto','custom')),
  "support_note" TEXT,
  "note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_part_instructions_object_id_fkey" FOREIGN KEY (object_id) REFERENCES work_asset_objects(id) ON DELETE CASCADE,
  CONSTRAINT "work_part_instructions_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_part_instructions_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES work_variants(id) ON DELETE CASCADE,
  CONSTRAINT "work_part_instructions_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_tags" (
  "work_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  CONSTRAINT "work_tags_pkey" PRIMARY KEY (work_id, tag_id),
  CONSTRAINT "work_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  CONSTRAINT "work_tags_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE "work_validation_issues" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "asset_id" TEXT NOT NULL,
  "object_id" TEXT,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL CHECK("severity" IN ('ok','warning','error')),
  "message" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT ('{}') CHECK(json_valid("detail")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "work_validation_issues_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES work_assets(id) ON DELETE CASCADE,
  CONSTRAINT "work_validation_issues_object_id_fkey" FOREIGN KEY (object_id) REFERENCES work_asset_objects(id) ON DELETE CASCADE,
  CONSTRAINT "work_validation_issues_pkey" PRIMARY KEY (id)
);

CREATE TABLE "work_variants" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "work_id" TEXT NOT NULL,
  "size_label" TEXT NOT NULL,
  "nui_size_cm" REAL,
  "scale_ratio" REAL NOT NULL DEFAULT (1.0),
  "is_base" INTEGER NOT NULL DEFAULT (false) CHECK("is_base" IN (0,1)),
  "asset_id" TEXT,
  "bbox_x_mm" REAL,
  "bbox_y_mm" REAL,
  "bbox_z_mm" REAL,
  "est_filament_grams" REAL,
  "est_print_hours" REAL,
  "part_count" INTEGER NOT NULL DEFAULT (1),
  "batch_count" INTEGER NOT NULL DEFAULT (1),
  "batch_count_override" INTEGER,
  "print_fee_jpy" INTEGER,
  "price_jpy" INTEGER,
  "stock" INTEGER,
  "is_listed" INTEGER NOT NULL DEFAULT (false) CHECK("is_listed" IN (0,1)),
  "is_printable" INTEGER NOT NULL DEFAULT (true) CHECK("is_printable" IN (0,1)),
  "unprintable_reason" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "max_part_bbox_x_mm" REAL,
  "max_part_bbox_y_mm" REAL,
  "max_part_bbox_z_mm" REAL,
  "oversized_parts" TEXT NOT NULL DEFAULT ('[]') CHECK(json_valid("oversized_parts")) CHECK(json_type("oversized_parts")='array'),
  "fit_width_mm" REAL,
  "fit_height_mm" REAL,
  "fit_depth_mm" REAL,
  "fit_source" TEXT NOT NULL DEFAULT ('creator'),
  "fit_note" TEXT,
  CONSTRAINT "work_variants_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES work_assets(id) ON DELETE RESTRICT,
  CONSTRAINT "work_variants_fit_depth_mm_check" CHECK (((fit_depth_mm IS NULL) OR (fit_depth_mm > (0)))),
  CONSTRAINT "work_variants_fit_height_mm_check" CHECK (((fit_height_mm IS NULL) OR (fit_height_mm > (0)))),
  CONSTRAINT "work_variants_fit_source_check" CHECK ((fit_source IN ('creator', 'auto'))),
  CONSTRAINT "work_variants_fit_width_mm_check" CHECK (((fit_width_mm IS NULL) OR (fit_width_mm > (0)))),
  CONSTRAINT "work_variants_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_variants_price_jpy_check" CHECK (((price_jpy IS NULL) OR (price_jpy >= 0))),
  CONSTRAINT "work_variants_scale_ratio_check" CHECK ((scale_ratio > (0))),
  CONSTRAINT "work_variants_stock_check" CHECK (((stock IS NULL) OR (stock >= 0))),
  CONSTRAINT "work_variants_work_id_fkey" FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  CONSTRAINT "work_variants_work_id_size_label_key" UNIQUE (work_id, size_label)
);

CREATE TABLE "works" (
  "id" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  "creator_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT (''),
  "status" TEXT NOT NULL DEFAULT ('draft') CHECK("status" IN ('draft','published','archived')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepts_color_change" INTEGER NOT NULL DEFAULT (false) CHECK("accepts_color_change" IN (0,1)),
  "accepts_mirror" INTEGER NOT NULL DEFAULT (false) CHECK("accepts_mirror" IN (0,1)),
  "accepts_stand_hole" INTEGER NOT NULL DEFAULT (false) CHECK("accepts_stand_hole" IN (0,1)),
  "accepts_custom_size" INTEGER NOT NULL DEFAULT (false) CHECK("accepts_custom_size" IN (0,1)),
  "accepts_other_request" INTEGER NOT NULL DEFAULT (false) CHECK("accepts_other_request" IN (0,1)),
  "favorite_count" INTEGER NOT NULL DEFAULT (0),
  "min_price_jpy" INTEGER,
  "previous_min_price_jpy" INTEGER,
  "price_changed_at" TEXT,
  "min_buyer_total_jpy" INTEGER,
  CONSTRAINT "works_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "works_favorite_count_check" CHECK ((favorite_count >= 0)),
  CONSTRAINT "works_pkey" PRIMARY KEY (id)
);

CREATE INDEX addresses_user_id_idx ON addresses (user_id);

CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);

CREATE INDEX auth_verifications_identifier_idx ON auth_verifications (identifier);

CREATE INDEX coordinate_post_pins_post_id_idx ON coordinate_post_pins (post_id);

CREATE INDEX coordinate_posts_user_id_idx ON coordinate_posts (user_id);

CREATE UNIQUE INDEX creator_applications_one_pending_per_user ON creator_applications (user_id) WHERE (status = 'pending');

CREATE INDEX creator_applications_status_idx ON creator_applications (status);

CREATE INDEX creator_applications_user_id_idx ON creator_applications (user_id);

CREATE INDEX custom_order_quotes_buyer_idx ON custom_order_quotes (buyer_id, status);

CREATE INDEX custom_order_quotes_creator_idx ON custom_order_quotes (creator_id, status);

CREATE UNIQUE INDEX custom_order_quotes_one_open_idx ON custom_order_quotes (request_id) WHERE (status IN ('sent', 'accepted'));

CREATE INDEX custom_order_quotes_request_idx ON custom_order_quotes (request_id);

CREATE INDEX filament_ledger_filament_idx ON filament_ledger (filament_id, created_at DESC);

CREATE INDEX filaments_active_idx ON filaments (is_active) WHERE is_active;

CREATE INDEX messages_conversation_page_idx ON messages (sender_id, recipient_id, created_at DESC, id DESC);

CREATE INDEX messages_inbox_page_idx ON messages (recipient_id, created_at DESC, id DESC);

CREATE INDEX messages_order_id_idx ON messages (order_id);

CREATE INDEX messages_recipient_id_idx ON messages (recipient_id);

CREATE INDEX notifications_email_pending_idx ON notifications (created_at) WHERE (emailed_at IS NULL);

CREATE UNIQUE INDEX notifications_source_uniq ON notifications (user_id, source_table, source_id, kind) WHERE (source_id IS NOT NULL);

CREATE INDEX notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_user_id_idx ON notifications (user_id);

CREATE INDEX notifications_user_kind_idx ON notifications (user_id, kind, created_at DESC);

CREATE INDEX nui_assets_nui_idx ON nui_assets (nui_id, kind);

CREATE UNIQUE INDEX nui_profiles_one_main_idx ON nui_profiles (user_id) WHERE is_main;

CREATE INDEX nui_profiles_user_idx ON nui_profiles (user_id, created_at DESC);

CREATE INDEX nui_scans_nui_idx ON nui_scans (nui_id, created_at DESC);

CREATE INDEX nui_scans_user_idx ON nui_scans (user_id, created_at DESC);

CREATE INDEX order_items_creator_id_idx ON order_items (creator_id);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);

CREATE INDEX order_status_history_order_id_idx ON order_status_history (order_id);

CREATE INDEX orders_buyer_id_idx ON orders (buyer_id);

CREATE INDEX orders_buyer_page_idx ON orders (buyer_id, created_at DESC, id DESC);

CREATE INDEX orders_created_page_idx ON orders (created_at DESC, id DESC);

CREATE INDEX orders_status_idx ON orders (status);

CREATE INDEX payout_requests_creator_id_idx ON payout_requests (creator_id);

CREATE INDEX print_job_events_job_idx ON print_job_events (print_job_id, created_at);

CREATE INDEX print_jobs_due_page_idx ON print_jobs (due_at, job_no, id);

CREATE INDEX print_jobs_order_id_idx ON print_jobs (order_id);

CREATE UNIQUE INDEX print_jobs_order_item_idx ON print_jobs (order_item_id);

CREATE INDEX print_jobs_overdue_idx ON print_jobs (due_at) WHERE (status IN ('queued', 'printing', 'reprinting'));

CREATE INDEX print_jobs_printer_idx ON print_jobs (printer_id) WHERE (printer_id IS NOT NULL);

CREATE INDEX print_jobs_status_due_idx ON print_jobs (status, due_at);

CREATE UNIQUE INDEX print_pricing_rules_single_active_idx ON print_pricing_rules (is_active) WHERE is_active;

CREATE INDEX printers_active_idx ON printers (is_active) WHERE is_active;

CREATE INDEX qc_inspections_job_idx ON qc_inspections (print_job_id, created_at DESC);

CREATE INDEX qna_threads_work_id_idx ON qna_threads (work_id);

CREATE INDEX reviews_work_id_idx ON reviews (work_id);

CREATE INDEX revision_requests_creator_idx ON revision_requests (creator_id, status);

CREATE INDEX revision_requests_due_idx ON revision_requests (due_at) WHERE (status = 'open');

CREATE INDEX revision_requests_work_idx ON revision_requests (work_id);

CREATE UNIQUE INDEX shipments_order_idx ON shipments (order_id);

CREATE INDEX shipments_page_idx ON shipments (shipped_at DESC, id DESC);

CREATE INDEX shipments_tracking_idx ON shipments (tracking_number) WHERE (tracking_number IS NOT NULL);

CREATE UNIQUE INDEX tryon_renders_uniq ON tryon_renders (nui_id, variant_id, view);

CREATE INDEX work_asset_objects_asset_id_idx ON work_asset_objects (asset_id);

CREATE UNIQUE INDEX work_assets_one_primary_idx ON work_assets (work_id) WHERE is_primary;

CREATE INDEX work_assets_work_id_idx ON work_assets (work_id);

CREATE INDEX work_color_slots_work_id_idx ON work_color_slots (work_id);

CREATE INDEX work_favorites_user_created_idx ON work_favorites (user_id, created_at DESC);

CREATE INDEX work_images_work_id_idx ON work_images (work_id);

CREATE UNIQUE INDEX work_part_instructions_unique_idx ON work_part_instructions (object_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX work_part_instructions_work_id_idx ON work_part_instructions (work_id);

CREATE INDEX work_tags_tag_id_idx ON work_tags (tag_id);

CREATE INDEX work_validation_issues_asset_id_idx ON work_validation_issues (asset_id);

CREATE INDEX work_variants_listed_idx ON work_variants (is_listed) WHERE is_listed;

CREATE INDEX work_variants_nui_size_idx ON work_variants (nui_size_cm);

CREATE UNIQUE INDEX work_variants_one_base_idx ON work_variants (work_id) WHERE is_base;

CREATE INDEX work_variants_work_id_idx ON work_variants (work_id);

CREATE INDEX works_creator_id_idx ON works (creator_id);

CREATE INDEX works_creator_page_idx ON works (creator_id, created_at DESC, id DESC);

CREATE INDEX works_favorite_rank_idx ON works (favorite_count DESC, created_at DESC) WHERE (status = 'published');

CREATE INDEX works_status_idx ON works (status);

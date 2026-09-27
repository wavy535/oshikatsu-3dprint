import { writeD1Migration as writeFile } from "./remote-sql.mjs";
import { now } from "./generate-schema.mjs";
const user = "(SELECT user_id FROM _request_context WHERE id=1)";
const service = "(SELECT role FROM _request_context WHERE id=1)='app_service'";
const admin = `EXISTS(SELECT 1 FROM profiles WHERE id=${user} AND role='admin')`;
const raise = (condition, message) =>
  `SELECT CASE WHEN ${condition} THEN RAISE(ABORT,'${message.replaceAll("'", "''")}') END;`;
const begin =
  "UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;";
const end =
  "UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;";
const sql = [];
function command(name, columns, body) {
  sql.push(
    `CREATE VIEW _${name} AS SELECT ${columns.map((c) => `NULL AS ${c}`).join(",")} WHERE 0;\nCREATE TRIGGER command_${name} INSTEAD OF INSERT ON _${name} BEGIN\n${body}\nEND;`,
  );
}
command(
  "assert",
  ["ok"],
  raise(
    "NOT coalesce(NEW.ok,0)",
    "更新対象が変わりました。画面を読み込み直してください",
  ),
);
command(
  "checkout",
  ["order_id", "address_id", "request_id", "note"],
  `
${raise(`${user} IS NULL`, "permission denied: ログインが必要です")}
${raise("NEW.request_id IS NULL OR length(NEW.note)>500", "注文の入力内容が不正です")}
SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE buyer_id=${user} AND checkout_request_id=NEW.request_id) THEN RAISE(IGNORE) END;
${begin}
${raise(`NOT EXISTS(SELECT 1 FROM addresses WHERE id=NEW.address_id AND user_id=${user})`, "お届け先が見つかりません")}
${raise("NOT EXISTS(SELECT 1 FROM print_pricing_rules WHERE is_active)", "有効な料金表がありません")}
${raise(`NOT EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=${user})`, "カートが空です")}
${raise(`EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id JOIN works w ON w.id=v.work_id WHERE c.user_id=${user} AND (w.status<>'published' OR NOT v.is_listed) AND NOT EXISTS(SELECT 1 FROM custom_order_quotes q WHERE q.variant_id=v.id AND q.buyer_id=${user} AND q.status IN ('accepted','ordered')))`, "現在購入できない作品が含まれています")}
${raise(`EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id WHERE c.user_id=${user} AND NOT v.is_printable)`, "造形できないサイズが含まれています")}
${raise(`EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variants v ON v.id=ci.variant_id WHERE c.user_id=${user} AND v.stock IS NOT NULL AND v.stock<ci.quantity)`, "在庫が足りません")}
${raise(`EXISTS(SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variant_pricing v ON v.id=ci.variant_id WHERE c.user_id=${user} AND (v.price_jpy IS NULL OR v.buyer_total_jpy IS NULL))`, "価格が決まっていません")}
INSERT INTO orders(id,buyer_id,status,subtotal_amount,platform_fee_amount,print_cost_amount,shipping_fee_amount,total_amount,shipping_address_id,checkout_request_id,is_demo)
SELECT NEW.order_id,${user},'payment_pending',0,0,0,shipping_fee_jpy,0,NEW.address_id,NEW.request_id,1 FROM print_pricing_rules WHERE is_active LIMIT 1;
INSERT INTO order_items(order_id,work_id,creator_id,variant_id,size_label_snapshot,unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,print_fee_snapshot,stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot,color_slots_snapshot,part_instructions_snapshot)
SELECT NEW.order_id,p.work_id,w.creator_id,p.id,p.size_label,p.price_jpy,ci.quantity,p.creator_payout_jpy*ci.quantity,(p.price_jpy-p.creator_payout_jpy)*ci.quantity,p.print_fee_jpy*ci.quantity,p.print_fee_jpy,
coalesce((SELECT storage_path FROM work_assets WHERE work_id=p.work_id AND is_primary LIMIT 1),''),
coalesce((SELECT f.material FROM work_color_slots cs JOIN filaments f ON f.id=cs.filament_id WHERE cs.work_id=p.work_id ORDER BY cs.slot_index LIMIT 1),'未指定'),
coalesce((SELECT f.color_name FROM work_color_slots cs JOIN filaments f ON f.id=cs.filament_id WHERE cs.work_id=p.work_id ORDER BY cs.slot_index LIMIT 1),'未指定'),
(SELECT json_group_array(json_object('slot_index',cs.slot_index,'source_name',cs.source_name,'material',f.material,'color_name',f.color_name,'color_hex',f.color_hex)) FROM (SELECT * FROM work_color_slots WHERE work_id=p.work_id ORDER BY slot_index) cs LEFT JOIN filaments f ON f.id=cs.filament_id),
(SELECT json_group_array(json_object('part',parts.name,'orientation',parts.orientation,'support',parts.support,'support_note',parts.support_note,'note',parts.note)) FROM (SELECT o.name,pi.orientation,pi.support,pi.support_note,pi.note FROM work_part_instructions pi JOIN work_asset_objects o ON o.id=pi.object_id WHERE pi.work_id=p.work_id AND (pi.variant_id IS NULL OR pi.variant_id=p.id) ORDER BY o.object_index) parts)
FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN work_variant_pricing p ON p.id=ci.variant_id JOIN works w ON w.id=p.work_id WHERE c.user_id=${user};
UPDATE orders SET subtotal_amount=(SELECT sum(unit_price*quantity) FROM order_items WHERE order_id=NEW.order_id),print_cost_amount=(SELECT sum(print_cost_amount) FROM order_items WHERE order_id=NEW.order_id),platform_fee_amount=(SELECT sum(platform_fee_amount) FROM order_items WHERE order_id=NEW.order_id),total_amount=(SELECT sum(unit_price*quantity+print_cost_amount) FROM order_items WHERE order_id=NEW.order_id)+shipping_fee_amount WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(NEW.order_id,'payment_pending',NEW.note,${user});
INSERT INTO _confirm_order(order_id) VALUES(NEW.order_id);
${end}`,
);
command(
  "confirm_order",
  ["order_id"],
  `
${raise(`NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_id=${user})`, "permission denied: この注文を操作できません")}
${raise("EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND (checkout_started_at IS NOT NULL OR stripe_checkout_session_id IS NOT NULL))", "外部決済の履歴があるため、運営へお問い合わせください")}
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='payment_pending') THEN RAISE(IGNORE) END;
${begin}
${raise("EXISTS(SELECT 1 FROM order_items oi JOIN work_variants v ON v.id=oi.variant_id WHERE oi.order_id=NEW.order_id AND v.stock IS NOT NULL AND v.stock<oi.quantity)", "在庫が足りません")}
UPDATE orders SET is_demo=1,status='paid',stripe_payment_intent_id='demo-'||NEW.order_id,updated_at=${now} WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(NEW.order_id,'paid','demo-'||NEW.order_id,${user});
UPDATE work_variants SET stock=stock-(SELECT sum(quantity) FROM order_items WHERE order_id=NEW.order_id AND variant_id=work_variants.id) WHERE stock IS NOT NULL AND id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id=${user}) AND variant_id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
UPDATE custom_order_quotes SET status='ordered',ordered_at=${now},updated_at=${now} WHERE status='accepted' AND variant_id IN (SELECT variant_id FROM order_items WHERE order_id=NEW.order_id);
UPDATE orders SET ship_due_at=coalesce(ship_due_at,strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 days')),status='printing_queued',updated_at=${now} WHERE id=NEW.order_id;
INSERT INTO print_jobs(order_id,order_item_id,variant_id,quantity,part_count,batch_count,est_filament_grams,est_print_hours,print_fee_snapshot,due_at)
SELECT oi.order_id,oi.id,oi.variant_id,oi.quantity,coalesce(v.part_count,1),coalesce(v.batch_count,1),v.est_filament_grams*oi.quantity,v.est_print_hours*oi.quantity,coalesce(oi.print_fee_snapshot,v.print_fee_jpy),o.ship_due_at
FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN work_variants v ON v.id=oi.variant_id WHERE oi.order_id=NEW.order_id AND NOT EXISTS(SELECT 1 FROM print_jobs WHERE order_item_id=oi.id);
${end}`,
);
command(
  "cancel_order",
  ["order_id"],
  `
${raise(`NOT (${service}) AND ${user} IS NULL`, "permission denied: ログインが必要です")}
${raise(`EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_id IS NOT ${user}) AND NOT (${service} OR ${admin})`, "permission denied: この注文を取り消す権限がありません")}
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='payment_pending') THEN RAISE(IGNORE) END;
${raise(`NOT (${service}) AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND checkout_started_at IS NOT NULL)`, "permission denied: 決済状況を確認してから取り消してください")}
${begin}
UPDATE orders SET status='cancelled',updated_at=${now} WHERE id=NEW.order_id;
INSERT INTO order_status_history(order_id,status,note,changed_by) SELECT id,'cancelled','未払い注文の取消',coalesce(${user},buyer_id) FROM orders WHERE id=NEW.order_id;
${end}`,
);
command(
  "accept_quote",
  ["quote_id", "work_id", "variant_id"],
  `
${raise(`${user} IS NULL`, "permission denied: ログインが必要です")}
${raise("NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id)", "見積りが見つかりません")}
${raise(`NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND buyer_id=${user})`, "permission denied: この見積りを承認できるのは依頼した本人だけです")}
${raise("NOT EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND status='sent')", "提示中の見積りではありません")}
${raise(`EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND expires_at<${now})`, "この見積りは有効期限を過ぎています")}
${begin}
INSERT INTO works(id,creator_id,title,description,status) SELECT NEW.work_id,creator_id,'オーダーメイド '||quote_no,coalesce(note,''),'draft' FROM custom_order_quotes WHERE id=NEW.quote_id AND base_work_id IS NULL;
INSERT INTO work_variants(id,work_id,size_label,scale_ratio,asset_id,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,est_filament_grams,est_print_hours,part_count,price_jpy,stock,is_listed)
SELECT NEW.variant_id,coalesce(base_work_id,NEW.work_id),'オーダーメイド '||quote_no,1,asset_id,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,est_filament_grams,est_print_hours,part_count,price_jpy,1,0 FROM custom_order_quotes WHERE id=NEW.quote_id;
UPDATE custom_order_quotes SET status='accepted',variant_id=NEW.variant_id,accepted_at=${now},updated_at=${now} WHERE id=NEW.quote_id;
UPDATE custom_order_requests SET status='accepted' WHERE id=(SELECT request_id FROM custom_order_quotes WHERE id=NEW.quote_id);
INSERT INTO cart_items(cart_id,variant_id,quantity) SELECT id,NEW.variant_id,1 FROM carts WHERE user_id=${user} ON CONFLICT(cart_id,variant_id) DO NOTHING;
${end}`,
);
command(
  "decline_quote",
  ["quote_id"],
  `
${raise(`${user} IS NULL`, "permission denied: ログインが必要です")}
${raise(`EXISTS(SELECT 1 FROM custom_order_quotes WHERE id=NEW.quote_id AND buyer_id IS NOT ${user})`, "permission denied: この見積りを辞退できるのは依頼した本人だけです")}
${begin}
UPDATE custom_order_quotes SET status='declined',updated_at=${now} WHERE id=NEW.quote_id AND status='sent';
${end}`,
);
command(
  "grant_admin",
  ["email"],
  `
${raise(`NOT (${admin})`, "permission denied: 運営だけが実行できます")}
${raise("NOT EXISTS(SELECT 1 FROM app_users WHERE lower(email)=lower(trim(NEW.email)))", "そのメールアドレスで登録されたユーザーが見つかりません")}
${raise("EXISTS(SELECT 1 FROM profiles p JOIN app_users u ON u.id=p.id WHERE lower(u.email)=lower(trim(NEW.email)) AND p.role='admin')", "すでに運営メンバーです")}
${begin}
UPDATE profiles SET role_before_admin=role,role='admin' WHERE id=(SELECT id FROM app_users WHERE lower(email)=lower(trim(NEW.email)) LIMIT 1);
${end}`,
);
command(
  "revoke_admin",
  ["user_id"],
  `
${raise(`NOT (${admin})`, "permission denied: 運営だけが実行できます")}
${raise(`NEW.user_id=${user}`, "自分自身は解除できません（他の運営メンバーに頼んでください）")}
${raise("NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.user_id AND role='admin')", "そのユーザーは運営メンバーではありません")}
${begin}
UPDATE profiles SET role=coalesce(role_before_admin,CASE WHEN EXISTS(SELECT 1 FROM creator_applications WHERE user_id=NEW.user_id AND status='approved') THEN 'creator' ELSE 'buyer' END),role_before_admin=NULL WHERE id=NEW.user_id;
${end}`,
);
await writeFile("db/d1/0006_commands.sql", sql.join("\n\n") + "\n");
console.log("Generated atomic domain commands");

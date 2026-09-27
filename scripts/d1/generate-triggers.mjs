import { writeFile, readFile } from "node:fs/promises";
import catalog from "../../db/oracle/postgres.json" with { type: "json" };
import { now, uuid, expression } from "./generate-schema.mjs";
const sql = [];
const user = "(SELECT user_id FROM _request_context WHERE id=1)";
const service = "(SELECT role FROM _request_context WHERE id=1)='app_service'";
const internal = "(SELECT internal_depth FROM _request_context WHERE id=1)>0";
const admin = `EXISTS(SELECT 1 FROM profiles WHERE id=${user} AND role='admin')`;
function trigger(name, table, event, body, when = "", before = false) {
  sql.push(
    `CREATE TRIGGER ${name} ${before ? "BEFORE" : "AFTER"} ${event} ON ${table}${when ? " WHEN " + when : ""} BEGIN\n${before ? "" : "UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;\n"}${body}\n${before ? "" : "UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;\n"}END;`,
  );
}
function both(name, table, fields, body, when = "") {
  trigger(name + "_insert", table, "INSERT", body, when);
  trigger(name + "_update", table, "UPDATE OF " + fields, body, when);
}
function reject(condition, message) {
  return `SELECT CASE WHEN ${condition} THEN RAISE(ABORT,'${message.replaceAll("'", "''")}') END;`;
}
const fee = (grams, hours, parts) =>
  `(SELECT round(coalesce(${grams},0)*material_yen_per_gram)+round(coalesce(${hours},0)*machine_yen_per_hour)+handling_base_yen+handling_per_part_yen*max(coalesce(${parts},1),1) FROM print_pricing_rules WHERE is_active LIMIT 1)`;
const notify = (
  userId,
  kind,
  title,
  body,
  link,
  table,
  id = "NEW.id",
  from = "",
  where = "1",
) =>
  `INSERT INTO _notify(user_id,kind,title,body,link_path,source_table,source_id) SELECT ${userId},'${kind}',${title},${body},${link},'${table}',${id} ${from} WHERE ${where};`;
sql.push(`CREATE VIEW _notify AS SELECT NULL AS user_id,NULL AS kind,NULL AS title,NULL AS body,NULL AS link_path,NULL AS source_table,NULL AS source_id WHERE 0;
CREATE TRIGGER dispatch_notification INSTEAD OF INSERT ON _notify BEGIN
INSERT INTO notifications(user_id,kind,title,body,link_path,source_table,source_id)
SELECT NEW.user_id,NEW.kind,NEW.title,NEW.body,NEW.link_path,NEW.source_table,NEW.source_id
WHERE NEW.user_id IS NOT NULL AND (NEW.kind IN ('order_shipping','creator') OR coalesce((SELECT in_app FROM notification_preferences WHERE user_id=NEW.user_id AND kind=NEW.kind),1)) ON CONFLICT DO NOTHING;
END;
CREATE TABLE _sequences(name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO _sequences VALUES('job',1000),('quote',1000),('revision',1000);`);

trigger(
  "create_profile_and_cart",
  "app_users",
  "INSERT",
  `
INSERT INTO profiles(id,display_name) VALUES(NEW.id,coalesce(nullif(NEW.name,''),substr(NEW.email,1,instr(NEW.email,'@')-1)));
INSERT INTO carts(user_id) VALUES(NEW.id);`,
);
trigger(
  "guard_profile_role",
  "profiles",
  "UPDATE OF role",
  reject(
    `NEW.role IS NOT OLD.role AND NOT (${service} OR ${internal} OR ${admin})`,
    "permission denied: role は運営だけが変更できます",
  ),
  "",
  true,
);
trigger(
  "creator_application_email_check",
  "creator_applications",
  "INSERT",
  reject(
    "NEW.terms_version IS NULL OR length(trim(NEW.terms_version))=0",
    "terms_not_agreed",
  ) +
    "\n" +
    reject(
      "NOT EXISTS(SELECT 1 FROM app_users WHERE id=NEW.user_id AND email_verified=1)",
      "email_not_verified",
    ),
  "",
  true,
);
trigger(
  "creator_application_consent",
  "creator_applications",
  "INSERT",
  `UPDATE creator_applications SET terms_agreed_at=${now},phone=NULL,phone_verified_at=NULL WHERE id=NEW.id;`,
);
trigger(
  "creator_application_review",
  "creator_applications",
  "UPDATE OF status",
  `
UPDATE profiles SET role='creator' WHERE id=NEW.user_id AND role='buyer' AND NEW.status='approved';
UPDATE creator_applications SET reviewed_at=coalesce(NEW.reviewed_at,${now}) WHERE id=NEW.id AND NEW.status IN ('approved','rejected');
${notify("NEW.user_id", "creator", "CASE NEW.status WHEN 'approved' THEN 'クリエイター登録が承認されました' ELSE 'クリエイター申請は承認されませんでした' END", "CASE NEW.status WHEN 'approved' THEN '作品の投稿ができるようになりました。まずは作品管理から3Dデータを登録してください。' ELSE coalesce('運営より：'||nullif(trim(NEW.admin_note),''),'内容を見直して、あらためて申請できます。') END", "CASE NEW.status WHEN 'approved' THEN '/studio/works' ELSE '/creator/apply' END", "creator_applications", "NEW.id", "", "NEW.status IN ('approved','rejected')")}`,
  "NEW.status IS NOT OLD.status",
);
for (const table of ["profiles", "payout_accounts", "orders", "works"]) {
  const fields = catalog.columns
    .filter((c) => c.table === table && c.name !== "updated_at")
    .map((c) => `"${c.name}"`)
    .join(",");
  trigger(
    "touch_" + table,
    table,
    "UPDATE OF " + fields,
    `UPDATE ${table} SET updated_at=${now} WHERE ${table === "payout_accounts" ? "creator_id" : "id"}=NEW.${table === "payout_accounts" ? "creator_id" : "id"};`,
  );
}
both(
  "nui_size",
  "nui_profiles",
  "height_mm",
  `UPDATE nui_profiles SET nui_size_cm=CASE WHEN NEW.height_mm<125 THEN 10 WHEN NEW.height_mm<175 THEN 15 ELSE 20 END,updated_at=${now} WHERE id=NEW.id;`,
);
trigger(
  "first_nui_is_main",
  "nui_profiles",
  "INSERT",
  `UPDATE nui_profiles SET is_main=1 WHERE id=NEW.id;`,
  "NOT EXISTS(SELECT 1 FROM nui_profiles WHERE user_id=NEW.user_id AND id<>NEW.id)",
);
trigger(
  "scan_ready",
  "nui_scans",
  "UPDATE OF status",
  `
UPDATE nui_profiles SET has_scan=1,updated_at=${now} WHERE id=NEW.nui_id;
UPDATE nui_scans SET completed_at=coalesce(completed_at,${now}) WHERE id=NEW.id;
${notify("NEW.user_id", "announcement", "coalesce((SELECT name FROM nui_profiles WHERE id=NEW.nui_id),'ぬい')||' の3Dモデルができました'", "'作品ページで「うちの子で見る」が使えるようになりました'", "'/my-nui/'||coalesce(NEW.nui_id,'')", "nui_scans")}`,
  "NEW.status='ready' AND OLD.status IS NOT 'ready'",
);
for (const [event, row] of [
  ["INSERT", "NEW"],
  ["DELETE", "OLD"],
])
  trigger(
    "favorite_count_" + event.toLowerCase(),
    "work_favorites",
    event,
    `UPDATE works SET favorite_count=(SELECT count(*) FROM work_favorites WHERE work_id=${row}.work_id) WHERE id=${row}.work_id;`,
  );

const fitX = "coalesce(NEW.max_part_bbox_x_mm,NEW.bbox_x_mm)",
  fitY = "coalesce(NEW.max_part_bbox_y_mm,NEW.bbox_y_mm)",
  fitZ = "coalesce(NEW.max_part_bbox_z_mm,NEW.bbox_z_mm)";
const oversized = `EXISTS(SELECT 1 FROM print_pricing_rules r WHERE r.is_active AND (max(${fitX},${fitY})>max(r.bed_x_mm,r.bed_y_mm) OR min(${fitX},${fitY})>min(r.bed_x_mm,r.bed_y_mm) OR coalesce(${fitZ},0)>r.bed_z_mm))`;
for (const event of ["INSERT", "UPDATE"])
  trigger(
    "variant_validate_" + event.toLowerCase(),
    "work_variants",
    event,
    reject(
      "NOT EXISTS(SELECT 1 FROM print_pricing_rules WHERE is_active)",
      "有効な print_pricing_rules がありません",
    ) +
      "\n" +
      reject(
        `NEW.is_listed AND NOT (${oversized}) AND NEW.price_jpy IS NOT NULL AND NEW.price_jpy < (SELECT CASE WHEN fee_billing='bundled' THEN ceil(${fee("NEW.est_filament_grams", "NEW.est_print_hours", "NEW.part_count")}/(1-platform_fee_rate)) ELSE 100 END FROM print_pricing_rules WHERE is_active LIMIT 1)`,
        "販売価格が下限を下回っています",
      ),
    "",
    true,
  );
both(
  "variant_calculate",
  "work_variants",
  "est_filament_grams,est_print_hours,part_count,bbox_x_mm,bbox_y_mm,bbox_z_mm,max_part_bbox_x_mm,max_part_bbox_y_mm,max_part_bbox_z_mm,batch_count_override,oversized_parts",
  `
UPDATE work_variants SET print_fee_jpy=${fee("NEW.est_filament_grams", "NEW.est_print_hours", "NEW.part_count")},
 is_printable=CASE WHEN ${fitX} IS NOT NULL AND ${fitY} IS NOT NULL THEN NOT (${oversized}) ELSE NEW.is_printable END,
 is_listed=CASE WHEN ${fitX} IS NOT NULL AND ${fitY} IS NOT NULL AND (${oversized}) THEN 0 ELSE NEW.is_listed END,
 unprintable_reason=CASE WHEN ${fitX} IS NOT NULL AND ${fitY} IS NOT NULL THEN CASE WHEN ${oversized} THEN '造形サイズがベッド上限を超過しています' END ELSE NEW.unprintable_reason END,
 batch_count=CASE WHEN NEW.batch_count_override IS NOT NULL THEN max(NEW.batch_count_override,1) WHEN NEW.est_print_hours IS NOT NULL THEN max(ceil(NEW.est_print_hours/(SELECT max_batch_hours FROM print_pricing_rules WHERE is_active LIMIT 1)),1) ELSE NEW.batch_count END,updated_at=${now} WHERE id=NEW.id;`,
);
both(
  "variant_fit",
  "work_variants",
  "scale_ratio",
  `
UPDATE work_variants SET fit_width_mm=(SELECT round(fit_width_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_height_mm=(SELECT round(fit_height_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),
 fit_depth_mm=(SELECT round(fit_depth_mm*NEW.scale_ratio,2) FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id LIMIT 1),fit_source='auto' WHERE id=NEW.id;`,
  "NOT NEW.is_base AND NEW.fit_width_mm IS NULL AND EXISTS(SELECT 1 FROM work_variants WHERE work_id=NEW.work_id AND is_base AND id<>NEW.id AND fit_width_mm IS NOT NULL)",
);
trigger(
  "variant_invalidate_tryon",
  "work_variants",
  "UPDATE",
  `DELETE FROM tryon_renders WHERE variant_id=NEW.id;`,
  "NEW.updated_at IS NOT OLD.updated_at",
);
for (const [event, row] of [
  ["INSERT", "NEW"],
  ["UPDATE OF price_jpy,is_listed,print_fee_jpy", "NEW"],
  ["DELETE", "OLD"],
]) {
  const min = `(SELECT min(price_jpy) FROM work_variants WHERE work_id=${row}.work_id AND is_listed AND price_jpy IS NOT NULL)`;
  const total = `(SELECT min(buyer_total_jpy) FROM work_variant_pricing WHERE work_id=${row}.work_id AND is_listed AND buyer_total_jpy IS NOT NULL)`;
  trigger(
    "variant_min_price_" + event.split(" ")[0].toLowerCase(),
    "work_variants",
    event,
    `UPDATE works SET previous_min_price_jpy=CASE WHEN min_price_jpy IS NOT ${min} THEN min_price_jpy ELSE previous_min_price_jpy END,price_changed_at=CASE WHEN min_price_jpy IS NOT ${min} THEN ${now} ELSE price_changed_at END,min_price_jpy=${min},min_buyer_total_jpy=${total} WHERE id=${row}.work_id;`,
  );
}
trigger(
  "order_fee_snapshot",
  "orders",
  "INSERT",
  `UPDATE orders SET platform_fee_rate=(SELECT platform_fee_rate FROM print_pricing_rules WHERE is_active LIMIT 1) WHERE id=NEW.id;`,
  "NEW.platform_fee_rate IS NULL",
);
trigger(
  "order_print_files_snapshot",
  "order_items",
  "INSERT",
  `
UPDATE order_items SET print_assets_snapshot=CASE WHEN EXISTS(SELECT 1 FROM work_assets WHERE work_id=NEW.work_id) THEN
(SELECT json_group_array(json_object('file_name',a.file_name,'storage_path',a.storage_path,'file_format',a.file_format,'scale_ratio',v.scale_ratio)) FROM (SELECT * FROM work_assets WHERE work_id=NEW.work_id ORDER BY is_primary DESC,created_at,id) a JOIN work_variants v ON v.id=NEW.variant_id)
WHEN NEW.stl_storage_path_snapshot<>'' THEN json_array(json_object('file_name','印刷データ','storage_path',NEW.stl_storage_path_snapshot)) ELSE '[]' END WHERE id=NEW.id;`,
);
trigger(
  "filament_ledger_apply",
  "filament_ledger",
  "INSERT",
  `UPDATE filaments SET stock_grams=max(stock_grams+round(NEW.delta_grams),0) WHERE id=NEW.filament_id;`,
);
trigger(
  "shipment_apply",
  "shipments",
  "INSERT",
  `UPDATE orders SET status='shipped',tracking_number=NEW.tracking_number,shipped_at=NEW.shipped_at,updated_at=${now} WHERE id=NEW.order_id;`,
);
for (const [table, col, prefix, sequence] of [
  ["print_jobs", "job_no", "J", "job"],
  ["custom_order_quotes", "quote_no", "CR", "quote"],
  ["revision_requests", "revision_no", "RV", "revision"],
])
  trigger(
    "number_" + table,
    table,
    "INSERT",
    `UPDATE _sequences SET value=value+1 WHERE name='${sequence}'; UPDATE ${table} SET ${col}='${prefix}-'||(SELECT value FROM _sequences WHERE name='${sequence}') WHERE id=NEW.id;`,
    `NEW.${col} IS NULL OR NEW.${col}=''`,
  );
both(
  "quote_calculate",
  "custom_order_quotes",
  "est_filament_grams,est_print_hours,part_count",
  `UPDATE custom_order_quotes SET print_fee_jpy=CASE WHEN NEW.est_filament_grams IS NOT NULL AND NEW.est_print_hours IS NOT NULL THEN ${fee("NEW.est_filament_grams", "NEW.est_print_hours", "NEW.part_count")} ELSE NEW.print_fee_jpy END,updated_at=${now} WHERE id=NEW.id;`,
);
both(
  "revision_charge",
  "revision_requests",
  "cause",
  `UPDATE revision_requests SET charged_to_creator=NEW.cause='model',updated_at=${now} WHERE id=NEW.id;`,
);
both(
  "revision_unlist",
  "revision_requests",
  "status",
  `UPDATE work_variants SET is_listed=0 WHERE id=NEW.variant_id;`,
  "NEW.status IN ('open','in_progress')",
);
trigger(
  "print_job_touch",
  "print_jobs",
  "UPDATE OF status",
  `UPDATE print_jobs SET started_at=CASE WHEN NEW.status='printing' AND OLD.status IS NOT 'printing' THEN coalesce(NEW.started_at,${now}) ELSE NEW.started_at END,finished_at=CASE WHEN NEW.status IN ('printed','qc_passed') THEN coalesce(NEW.finished_at,${now}) ELSE NEW.finished_at END,updated_at=${now} WHERE id=NEW.id;`,
);
for (const event of ["INSERT", "UPDATE OF status"])
  trigger(
    "print_job_event_" + event.split(" ")[0].toLowerCase(),
    "print_jobs",
    event,
    `INSERT INTO print_job_events(print_job_id,status) VALUES(NEW.id,NEW.status);
UPDATE orders SET status=CASE WHEN (SELECT count(*)=sum(status='qc_passed') FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled') THEN 'packaging' WHEN EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status IN ('printing','reprinting','printed','qc_failed')) THEN 'printing' ELSE 'printing_queued' END,updated_at=${now} WHERE id=NEW.order_id AND status IN ('paid','printing_queued','printing','packaging') AND EXISTS(SELECT 1 FROM print_jobs WHERE order_id=NEW.order_id AND status<>'cancelled');`,
    event === "INSERT" ? "" : "NEW.status IS NOT OLD.status",
  );
trigger(
  "qc_result_apply",
  "qc_inspections",
  "INSERT",
  `
UPDATE print_jobs SET status=CASE NEW.result WHEN 'passed' THEN 'qc_passed' ELSE 'qc_failed' END,failure_count=failure_count+CASE WHEN NEW.result='failed' THEN 1 ELSE 0 END WHERE id=NEW.print_job_id;
INSERT INTO revision_requests(work_id,variant_id,creator_id,inspection_id,print_job_id,cause,message,photo_paths,reprint_fee_jpy,created_by)
SELECT w.id,v.id,w.creator_id,NEW.id,j.id,NEW.reprint_cause,coalesce(NEW.memo,'検品で不合格になりました'),NEW.photo_paths,coalesce(j.print_fee_snapshot,v.print_fee_jpy,0),NEW.inspector_id
FROM print_jobs j JOIN work_variants v ON v.id=j.variant_id JOIN works w ON w.id=v.work_id
WHERE j.id=NEW.print_job_id AND NEW.result='failed' AND NEW.reprint_cause='model' AND NOT EXISTS(SELECT 1 FROM revision_requests WHERE print_job_id=j.id AND status IN ('open','in_progress'));`,
);
trigger(
  "payout_request_check",
  "payout_requests",
  "INSERT",
  [
    reject(
      "NOT EXISTS(SELECT 1 FROM payout_accounts WHERE creator_id=NEW.creator_id)",
      "振込先口座が登録されていません",
    ),
    reject(
      "NEW.amount>coalesce((SELECT available_amount FROM creator_payout_balances WHERE creator_id=NEW.creator_id),0)",
      "申請額が受取可能額を超えています",
    ),
    reject("NEW.amount<1000", "振込の申請は ¥1,000 から受け付けています"),
  ].join("\n"),
  "",
  true,
);

trigger(
  "message_notify",
  "messages",
  "INSERT",
  notify(
    "NEW.recipient_id",
    "message",
    "coalesce((SELECT display_name FROM profiles WHERE id=NEW.sender_id),'ユーザー')||' さんからメッセージが届きました'",
    "substr(NEW.body,1,60)",
    "'/mypage/messages?with='||NEW.sender_id",
    "messages",
  ),
);
trigger(
  "question_notify",
  "qna_threads",
  "INSERT",
  notify(
    "w.creator_id",
    "creator",
    "'作品に質問が届きました'",
    "w.title||' ／ '||substr(NEW.question,1,60)",
    "'/works/'||NEW.work_id||'/qa'",
    "qna_threads",
    "NEW.id",
    "FROM works w",
    "w.id=NEW.work_id AND w.creator_id<>NEW.asker_id",
  ),
);
trigger(
  "answer_notify",
  "qna_threads",
  "UPDATE OF answer",
  notify(
    "NEW.asker_id",
    "message",
    "'質問に回答がありました'",
    "coalesce((SELECT title FROM works WHERE id=NEW.work_id),'作品')||' ／ '||substr(NEW.answer,1,60)",
    "'/works/'||NEW.work_id||'/qa'",
    "qna_threads",
  ),
  "NEW.answer IS NOT NULL AND OLD.answer IS NULL",
);
trigger(
  "review_notify",
  "reviews",
  "INSERT",
  notify(
    "NEW.creator_id",
    "review",
    "'レビューが届きました'",
    "coalesce((SELECT title FROM works WHERE id=NEW.work_id),'作品')||' に ★'||NEW.rating||' のレビューが付きました'",
    "'/works/'||NEW.work_id||'/reviews'",
    "reviews",
  ),
);
trigger(
  "revision_notify",
  "revision_requests",
  "INSERT",
  notify(
    "NEW.creator_id",
    "creator",
    "'検品で修正依頼が発生しました'",
    "coalesce(NEW.revision_no,'修正依頼')||' ／ 原因: '||NEW.cause||' ／ 期限 '||strftime('%m月%d日',NEW.due_at)",
    "'/studio/revisions/'||NEW.id",
    "revision_requests",
  ),
);
trigger(
  "print_start_notify",
  "print_jobs",
  "UPDATE OF status",
  notify(
    "(SELECT buyer_id FROM orders WHERE id=NEW.order_id)",
    "order_shipping",
    "'印刷を開始しました'",
    "'ジョブ '||coalesce(NEW.job_no,NEW.id)",
    "'/mypage/orders/'||NEW.order_id",
    "print_jobs",
  ),
  "NEW.status='printing' AND OLD.status IS NOT 'printing'",
);
trigger(
  "shipment_notify",
  "shipments",
  "INSERT",
  notify(
    "(SELECT buyer_id FROM orders WHERE id=NEW.order_id)",
    "order_shipping",
    "'ご注文の商品を発送しました'",
    "coalesce(NEW.service_name,'宅配便')||CASE WHEN NEW.tracking_number IS NOT NULL THEN ' ／ 追跡番号 '||NEW.tracking_number ELSE '' END",
    "'/mypage/orders/'||NEW.order_id",
    "shipments",
  ),
);
trigger(
  "sale_notify",
  "orders",
  "UPDATE OF status",
  notify(
    "oi.creator_id",
    "creator",
    "'作品が売れました'",
    "coalesce(w.title,'作品')||' ×'||oi.quantity||' ／ 受取（見込み） ¥'||printf('%,d',oi.creator_payout_amount)",
    "'/studio'",
    "order_items",
    "oi.id",
    "FROM order_items oi LEFT JOIN works w ON w.id=oi.work_id",
    "oi.order_id=NEW.id",
  ),
  "NEW.status='paid' AND OLD.status='payment_pending'",
);
trigger(
  "price_drop_notify",
  "works",
  "UPDATE OF min_price_jpy",
  notify(
    "f.user_id",
    "favorite_price",
    "'お気に入りの作品が値下げされました'",
    "NEW.title||'　¥'||printf('%,d',NEW.previous_min_price_jpy)||' → ¥'||printf('%,d',NEW.min_price_jpy)",
    "'/works/'||NEW.id",
    "works_price",
    uuid,
    "FROM work_favorites f",
    "f.work_id=NEW.id",
  ),
  "NEW.min_price_jpy IS NOT OLD.min_price_jpy AND NEW.min_price_jpy<NEW.previous_min_price_jpy",
);
trigger(
  "payout_notify",
  "payout_requests",
  "UPDATE OF status",
  notify(
    "NEW.creator_id",
    "creator",
    "CASE NEW.status WHEN 'paid' THEN '振込が完了しました' ELSE '振込の申請が差し戻されました' END",
    "'¥'||printf('%,d',NEW.amount)||CASE NEW.status WHEN 'paid' THEN ' を振り込みました' ELSE ' の申請を確認してください' END",
    "'/studio/payouts'",
    "payout_requests",
  ),
  "NEW.status IS NOT OLD.status AND NEW.status IN ('paid','rejected')",
);
for (const event of ["INSERT", "UPDATE OF status"]) {
  let body = notify(
    "NEW.buyer_id",
    "message",
    "'オーダーメイドの見積りが届きました'",
    "coalesce(NEW.quote_no,'見積り')||' ／ 合計 ¥'||printf('%,d',NEW.price_jpy+NEW.print_fee_jpy+NEW.shipping_fee_jpy)||' ／ 有効期限 '||strftime('%m月%d日',NEW.expires_at)",
    "'/mypage/custom-orders/'||NEW.request_id",
    "custom_order_quotes",
    "NEW.id",
    "",
    "NEW.status='sent'",
  );
  if (event !== "INSERT")
    body +=
      "\n" +
      notify(
        "NEW.creator_id",
        "creator",
        "CASE NEW.status WHEN 'accepted' THEN '見積りが承認されました' WHEN 'ordered' THEN 'オーダーメイドが注文されました' ELSE '見積りが辞退されました' END",
        "coalesce(NEW.quote_no,'見積り')||' ／ '||coalesce((SELECT display_name FROM profiles WHERE id=NEW.buyer_id),'購入者')||' さん'",
        "'/studio/custom-orders/'||NEW.request_id",
        "custom_order_quotes",
        "NEW.id",
        "",
        "NEW.status IN ('accepted','declined','ordered')",
      ) +
      "\n" +
      notify(
        "NEW.buyer_id",
        "message",
        "'見積りの有効期限が切れました'",
        "coalesce(NEW.quote_no,'見積り')||' ／ 続けたい場合は相談から見積りを依頼し直してください'",
        "'/mypage/custom-orders/'||NEW.request_id",
        "custom_order_quotes",
        "NEW.id",
        "",
        "NEW.status='expired'",
      ) +
      "\n" +
      notify(
        "NEW.creator_id",
        "creator",
        "'見積りの有効期限が切れました'",
        "coalesce(NEW.quote_no,'見積り')||' ／ 承認されないまま期限を過ぎました'",
        "'/studio/custom-orders/'||NEW.request_id",
        "custom_order_quotes",
        "NEW.id",
        "",
        "NEW.status='expired'",
      );
  trigger(
    "quote_notify_" + event.split(" ")[0].toLowerCase(),
    "custom_order_quotes",
    event,
    body,
    event === "INSERT" ? "" : "NEW.status IS NOT OLD.status",
  );
}
await writeFile("db/d1/0004_triggers.sql", sql.join("\n\n") + "\n");
// Catalog definitions are retained, but invented printer/stock availability is not.
const masters = expression(
  await readFile("db/migrations/0003_masters.sql", "utf8"),
)
  .split("\n")
  .filter((line) => !line.includes("INSERT INTO printers"))
  .join("\n");
await writeFile(
  "db/d1/0005_catalog.sql",
  `UPDATE _request_context SET role='app_service' WHERE id=1;\n${masters}\nUPDATE filaments SET stock_grams=0;\nUPDATE _request_context SET role='app_guest' WHERE id=1;\n`,
);
console.log(`Generated ${sql.length} trigger definitions and initial catalog`);

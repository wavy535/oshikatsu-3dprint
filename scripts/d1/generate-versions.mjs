import catalog from "../../db/oracle/postgres.json" with { type: "json" };
import { writeD1Migration as writeFile } from "./remote-sql.mjs";
const statements = [
  "-- Monotonic versions detect edits while geometry analysis runs outside D1.",
  "ALTER TABLE works ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;",
];
for (const [table, field] of [
  ["work_assets", "work_id"],
  ["work_ar_assets", "work_id"],
  ["work_asset_objects", "asset_id"],
  ["work_validation_issues", "asset_id"],
  ["work_color_slots", "work_id"],
  ["work_part_instructions", "work_id"],
  ["work_variants", "work_id"],
  ["work_images", "work_id"],
  ["work_tags", "work_id"],
  ["work_assembly", "work_id"],
]) {
  for (const event of ["INSERT", "UPDATE", "DELETE"]) {
    const row = event === "DELETE" ? "OLD" : "NEW";
    const work =
      field === "work_id"
        ? `${row}.work_id`
        : `(SELECT work_id FROM work_assets WHERE id=${row}.asset_id)`;
    statements.push(`CREATE TRIGGER version_${table}_${event.toLowerCase()} AFTER ${event} ON ${table} BEGIN
UPDATE _request_context SET internal_depth=internal_depth+1 WHERE id=1;
UPDATE works SET edit_version=edit_version+1 WHERE id=${work};
UPDATE _request_context SET internal_depth=internal_depth-1 WHERE id=1;
END;`);
  }
}
const fields = catalog.columns
  .filter((c) => c.table === "works" && c.name !== "updated_at")
  .map((c) => c.name)
  .join(",");
statements.push(
  `CREATE TRIGGER version_works AFTER UPDATE OF ${fields} ON works BEGIN UPDATE works SET edit_version=edit_version+1 WHERE id=NEW.id; END;`,
);
statements.push(
  `CREATE TRIGGER creator_only_works BEFORE INSERT ON works WHEN (SELECT role='app_user' AND internal_depth=0 FROM _request_context WHERE id=1) AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.creator_id AND role IN ('creator','admin')) BEGIN SELECT RAISE(ABORT,'permission denied: 作品の投稿にはクリエイター登録が必要です'); END;`,
);
await writeFile("db/d1/0007_edit_versions.sql", statements.join("\n\n") + "\n");

import { writeD1Migration as writeFile } from "./remote-sql.mjs";
import catalog from "../../db/oracle/postgres.json" with { type: "json" };
const grants = catalog.columnPrivileges;
if (
  JSON.stringify(grants) !==
  JSON.stringify([
    {
      table: "notifications",
      column: "read_at",
      grantee: "app_user",
      privilege: "UPDATE",
    },
  ])
)
  throw new Error("Review new column grants before regenerating");
const forbidden = catalog.columns
  .filter((c) => c.table === "notifications" && c.name !== "read_at")
  .map((c) => `"${c.name}"`)
  .join(",");
await writeFile(
  "db/d1/0008_column_grants.sql",
  `-- PostgreSQL grants UPDATE(read_at), not table-wide UPDATE, to members.
DROP TRIGGER authorize_notifications_update;
CREATE TRIGGER authorize_notifications_update BEFORE UPDATE ON notifications
WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0)
BEGIN
 SELECT CASE WHEN OLD.user_id IS NOT (SELECT user_id FROM _request_context WHERE id=1) THEN RAISE(IGNORE) END;
 SELECT CASE WHEN (SELECT role FROM _request_context WHERE id=1)<>'app_user' OR NEW.user_id IS NOT (SELECT user_id FROM _request_context WHERE id=1) THEN RAISE(ABORT,'permission denied') END;
END;
CREATE TRIGGER authorize_notification_columns BEFORE UPDATE OF ${forbidden} ON notifications
WHEN NOT ((SELECT role FROM _request_context WHERE id=1)='app_service' OR (SELECT internal_depth FROM _request_context WHERE id=1)>0)
BEGIN SELECT RAISE(ABORT,'permission denied'); END;
`,
);

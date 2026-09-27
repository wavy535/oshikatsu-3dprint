// Compile the pinned, trusted policy catalog to SQLite views and write guards.
// Request identity is installed/cleared inside the SAME atomic D1 batch as queries.
import catalog from "../../db/oracle/postgres.json" with { type: "json" };
import { writeFile } from "node:fs/promises";
import { expression } from "./generate-schema.mjs";

const tables = [
  ...new Set(catalog.columns.filter((c) => c.kind === "r").map((c) => c.table)),
];
const user = "(SELECT user_id FROM _request_context WHERE id=1)";
const role = "(SELECT role FROM _request_context WHERE id=1)";
const internal = "(SELECT internal_depth FROM _request_context WHERE id=1)>0";
const admin = `EXISTS(SELECT 1 FROM profiles AS _admin WHERE _admin.id=${user} AND _admin.role='admin')`;
const service = `${role}='app_service'`;

function predicate(source, table, alias) {
  const columns = new Set(
    catalog.columns.filter((c) => c.table === table).map((c) => c.name),
  );
  // Catalog SQL only: quote-aware token replacement, never application/user SQL.
  let sql = expression(source).replace(
    /'(?:''|[^'])*'|\b[a-z_][a-z_0-9]*\b/gi,
    (token, offset, whole) => {
      if (token.startsWith("'")) return token;
      if (token === table && whole[offset + token.length] === ".") return alias;
      if (
        columns.has(token) &&
        whole[offset - 1] !== "." &&
        whole[offset + token.length] !== "(" &&
        whole[offset + token.length] !== "."
      )
        return `${alias}.${token}`;
      return token;
    },
  );
  sql = sql
    .replace(/app\.user_id\(\)/g, user)
    .replace(/app\.current_role\(\)/g, role)
    .replace(/\bis_admin\(\)/g, `(${admin})`);
  sql = sql.replace(
    /order_has_creator_items\(([^,]+), (\(SELECT user_id FROM _request_context WHERE id=1\))\)/g,
    (_, id, uid) =>
      `EXISTS(SELECT 1 FROM order_items AS _item WHERE _item.order_id=${id} AND _item.creator_id=${uid})`,
  );
  sql = sql.replace(
    /variant_reserved_for\(([^,]+), (\(SELECT user_id FROM _request_context WHERE id=1\))\)/g,
    (_, id, uid) =>
      `EXISTS(SELECT 1 FROM custom_order_quotes AS _quote WHERE _quote.variant_id=${id} AND _quote.buyer_id=${uid} AND _quote.status IN ('accepted','ordered'))`,
  );
  sql = sql.replace(
    /work_reserved_for\(([^,]+), (\(SELECT user_id FROM _request_context WHERE id=1\))\)/g,
    (_, id, uid) =>
      `EXISTS(SELECT 1 FROM custom_order_quotes AS _quote JOIN work_variants AS _variant ON _variant.id=_quote.variant_id WHERE _variant.work_id=${id} AND _quote.buyer_id=${uid} AND _quote.status IN ('accepted','ordered'))`,
  );
  return sql;
}
const statements = [
  "-- Identity is private server state, never supplied by browser form fields.",
];
for (const table of tables) {
  const policies = catalog.policies.filter(
    (p) => p.table === table && !p.roles.includes("app_service"),
  );
  const allowed = (command, which, alias) => {
    const clauses = policies
      .filter((p) => p.cmd === "ALL" || p.cmd === command)
      .map((p) => predicate(p[which] ?? p.qual ?? "true", table, alias));
    const privilege = catalog.privileges
      .filter(
        (p) =>
          p.table === table &&
          p.privilege === command &&
          p.grantee !== "app_service",
      )
      .map((p) => p.grantee);
    return clauses.length && privilege.length
      ? `(${role} IN (${[...new Set(privilege)].map((v) => `'${v}'`).join(",")}) AND (${clauses.join(" OR ")}))`
      : "0";
  };
  statements.push(
    `CREATE VIEW "visible_${table}" AS SELECT * FROM "${table}" WHERE ${service} OR ${internal} OR ${allowed("SELECT", "qual", table)};`,
  );
  for (const command of ["INSERT", "UPDATE", "DELETE"]) {
    const lines = [];
    if (command !== "INSERT")
      lines.push(
        `SELECT CASE WHEN NOT coalesce(${allowed(command, "qual", "OLD")},0) THEN RAISE(IGNORE) END;`,
      );
    if (command !== "DELETE")
      lines.push(
        `SELECT CASE WHEN NOT coalesce(${allowed(command, "check", "NEW")},0) THEN RAISE(ABORT,'permission denied') END;`,
      );
    statements.push(
      `CREATE TRIGGER "authorize_${table}_${command.toLowerCase()}" BEFORE ${command} ON "${table}" WHEN NOT (${service} OR ${internal}) BEGIN\n  ${lines.join("\n  ")}\nEND;`,
    );
  }
}
await writeFile("db/d1/0002_policies.sql", statements.join("\n\n") + "\n");
console.log(
  `Generated read views and write guards for ${tables.length} tables`,
);

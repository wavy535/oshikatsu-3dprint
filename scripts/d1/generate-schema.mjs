// Deterministic port of the captured catalog. Generated SQL is reviewed and committed.
// This script never connects to or modifies a database.
import catalog from "../../db/oracle/postgres.json" with { type: "json" };
import { writeFile } from "node:fs/promises";

const quote = (value) => `'${value.replaceAll("'", "''")}'`;
export const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const uuid =
  "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";
export function expression(source) {
  return source
    .replaceAll("'{}'::text[]", "'[]'")
    .replace(/::(?:public\.)?\w+(?:\[\])?/g, "")
    .replaceAll("public.", "")
    .replace(/<> ALL \(ARRAY\[([^\]]+)\]\)/g, "NOT IN ($1)")
    .replace(/= ANY \(ARRAY\[([^\]]+)\]\)/g, "IN ($1)")
    .replaceAll("now()", now)
    .replaceAll("gen_random_uuid()", uuid)
    .replace(
      /\(strftime\('%Y-%m-%dT%H:%M:%fZ','now'\) \+ '(\d+) days'\)/g,
      "strftime('%Y-%m-%dT%H:%M:%fZ','now','+$1 days')",
    )
    .replace(
      /\(strftime\('%Y-%m-%dT%H:%M:%fZ','now'\) - '(\d+) days'\)/g,
      "strftime('%Y-%m-%dT%H:%M:%fZ','now','-$1 days')",
    )
    .replace(/\bGREATEST\(/gi, "max(")
    .replace(/\bLEAST\(/gi, "min(")
    .replaceAll("jsonb_typeof", "json_type")
    .replaceAll(
      "portfolio_url ~* '^https?://'",
      "(lower(portfolio_url) LIKE 'http://%' OR lower(portfolio_url) LIKE 'https://%')",
    )
    .replace(
      /(\w+) ~ '\^#\[0-9A-Fa-f\]\{6\}\$'/g,
      "(length($1)=7 AND substr($1,1,1)='#' AND substr($1,2) NOT GLOB '*[^0-9A-Fa-f]*')",
    );
}

const enums = new Map(catalog.enums.map((e) => [e.name, e.values]));
const tables = [
  ...new Set(catalog.columns.filter((c) => c.kind === "r").map((c) => c.table)),
];
const metadata = {};
const statements = [
  "-- D1 / SQLite schema. Source catalog: db/oracle/postgres.json (3248d66).",
  "PRAGMA defer_foreign_keys = ON;",
  `CREATE TABLE _request_context (id INTEGER PRIMARY KEY CHECK(id=1), role TEXT NOT NULL DEFAULT 'app_guest', user_id TEXT, internal_depth INTEGER NOT NULL DEFAULT 0 CHECK(internal_depth>=0));`,
  "INSERT INTO _request_context(id) VALUES(1);",
  "CREATE TABLE _assertion (ok INTEGER NOT NULL CHECK(ok=1));",
];

for (const table of tables) {
  const columns = catalog.columns.filter(
    (c) => c.kind === "r" && c.table === table,
  );
  metadata[table] = {};
  const definitions = columns.map((c) => {
    const type =
      c.type === "boolean"
        ? "boolean"
        : c.type === "jsonb" || c.type === "text[]"
          ? "json"
          : /^numeric/.test(c.type)
            ? "number"
            : /^(smallint|integer|bigint)$/.test(c.type)
              ? "integer"
              : "string";
    metadata[table][c.name] = type;
    const sqlType =
      type === "boolean" || type === "integer"
        ? "INTEGER"
        : type === "number"
          ? "REAL"
          : "TEXT";
    const checks = [];
    if (type === "boolean") checks.push(`CHECK("${c.name}" IN (0,1))`);
    if (type === "json") checks.push(`CHECK(json_valid("${c.name}"))`);
    if (c.type === "text[]")
      checks.push(`CHECK(json_type("${c.name}")='array')`);
    if (enums.has(c.type))
      checks.push(
        `CHECK("${c.name}" IN (${enums.get(c.type).map(quote).join(",")}))`,
      );
    return `  "${c.name}" ${sqlType}${c.required ? " NOT NULL" : ""}${c.default ? ` DEFAULT (${expression(c.default)})` : ""}${checks.length ? " " + checks.join(" ") : ""}`;
  });
  for (const constraint of catalog.constraints.filter(
    (c) => c.table === table,
  )) {
    definitions.push(
      `  CONSTRAINT "${constraint.name}" ${expression(constraint.definition)}`,
    );
  }
  statements.push(`CREATE TABLE "${table}" (\n${definitions.join(",\n")}\n);`);
}
for (const index of catalog.indexes.filter(
  (i) => !catalog.constraints.some((c) => c.name === i.name),
)) {
  statements.push(
    expression(index.definition).replace(" USING btree", "") + ";",
  );
}
await writeFile("db/d1/0001_schema.sql", statements.join("\n\n") + "\n");
// Include derived-view types so SELECT aliases receive the same JSON/boolean decoding.
for (const c of catalog.columns.filter((c) => c.kind === "v")) {
  metadata[c.table] ??= {};
  metadata[c.table][c.name] =
    c.type === "boolean"
      ? "boolean"
      : c.type === "jsonb" || c.type === "text[]"
        ? "json"
        : "string";
}
await writeFile(
  "src/lib/db/d1/columns.json",
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(`Generated ${tables.length} tables`);

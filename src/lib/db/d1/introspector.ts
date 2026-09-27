import type { DatabaseIntrospector, TableMetadata } from "kysely";
import type { Actor, Binding } from "./runtime";
import columns from "./columns.json";

/** D1 reserves _cf_* tables. Kysely's generic introspector visits those tables
 * and fails SQLITE_AUTH. Inspect only our registered tables, never platform data. */
export function d1Introspector(
  binding: Binding,
  actor: Actor,
  tables: readonly string[] = Object.keys(columns),
): DatabaseIntrospector {
  return {
    async getSchemas() {
      return [];
    },
    async getTables(): Promise<TableMetadata[]> {
      if (actor.role !== "app_service") throw new Error("permission denied");
      if (tables.some((name) => !Object.hasOwn(columns, name))) {
        throw new Error("Unregistered introspection table");
      }
      const [result] = await binding.batch<{
        table_name: string;
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
      }>([
        binding
          .prepare(
            `SELECT t.value AS table_name, p.name, p.type, p."notnull", p.dflt_value
           FROM json_each(?) AS t JOIN pragma_table_info(t.value) AS p`,
          )
          .bind(JSON.stringify(tables)),
      ]);
      return tables.map((name) => ({
        name,
        isView: false,
        isForeign: false,
        columns: result.results
          .filter((c) => c.table_name === name)
          .map((c) => ({
            name: c.name,
            dataType: c.type,
            isNullable: !c.notnull,
            isAutoIncrementing: false,
            hasDefaultValue: c.dflt_value !== null,
          })),
      }));
    },
  };
}

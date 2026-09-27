import type { DatabaseIntrospector, TableMetadata } from "kysely";
import type { Actor, Binding } from "./runtime";
import columns from "./columns.json";

/** D1 reserves _cf_* tables. Kysely's generic introspector visits those tables
 * and fails SQLITE_AUTH. Inspect only our registered tables, never platform data. */
export function d1Introspector(
  binding: Binding,
  actor: Actor,
): DatabaseIntrospector {
  return {
    async getSchemas() {
      return [];
    },
    async getTables(): Promise<TableMetadata[]> {
      if (actor.role !== "app_service") throw new Error("permission denied");
      const names = Object.keys(columns);
      const results = await binding.batch<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
      }>(
        names.map((name) =>
          binding
            .prepare(
              'SELECT name,type,"notnull",dflt_value FROM pragma_table_info(?)',
            )
            .bind(name),
        ),
      );
      return results.map((result, index) => ({
        name: names[index],
        isView: false,
        isForeign: false,
        columns: result.results.map((c) => ({
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

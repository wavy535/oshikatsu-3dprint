import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Binding } from "@/lib/db/d1/runtime";
import { executeBatch } from "@/lib/db/d1/runtime";

/** D1's prepare/batch contract backed by SQLite, including all-or-nothing batches.
 * Worker integration tests additionally run the same scenarios in workerd. */
export function localD1(beforeStatement?: (sql: string) => void) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("db/d1")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`db/d1/${file}`, "utf8"));
  class Statement {
    constructor(
      readonly sql: string,
      readonly values: unknown[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Statement(this.sql, values);
    }
    run() {
      beforeStatement?.(this.sql);
      const statement = sqlite.prepare(this.sql);
      const results = statement.columns().length
        ? statement.all(...(this.values as never[]))
        : [];
      const change = statement.columns().length
        ? sqlite
            .prepare(
              "SELECT changes() AS changes,last_insert_rowid() AS last_row_id",
            )
            .get()!
        : statement.run(...(this.values as never[]));
      return {
        results,
        success: true,
        meta: {
          changes: Number(change.changes),
          last_row_id: Number(
            "lastInsertRowid" in change
              ? change.lastInsertRowid
              : change.last_row_id,
          ),
        },
      };
    }
  }
  const binding = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as Binding;
  // SQL fixture helper retains numbered value placeholders when converting old
  // test data. All SQL itself is SQLite; values remain bound, including repeats.
  async function query(sql: string, values: unknown[] = []) {
    const parameters: unknown[] = [];
    const source = sql.replace(/\$(\d+)/g, (_, n) => {
      parameters.push(values[Number(n) - 1]);
      return "?";
    });
    const result = (
      await executeBatch(binding, { role: "app_service" }, [
        { sql: source, parameters },
      ])
    )[0];
    // Test fixtures intentionally inspect arbitrary columns, like the old pg helper.
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: result.rows as Record<string, any>[],
      rowCount: Number(result.numAffectedRows),
    };
  }
  return {
    binding,
    sqlite,
    query,
    close: () => sqlite.close(),
    end: async () => {},
  };
}

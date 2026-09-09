import { Kysely, PostgresDialect, type PostgresPoolClient } from "kysely";
import { vi } from "vitest";
import type { Database } from "@/types/database";

/** Execute real query builders against a controlled driver, retaining SQL and
 * parameter assertions without mocking fluent methods. */
export function mockDatabase() {
  const query = vi
    .fn<
      (
        text: string,
        parameters: readonly unknown[],
      ) => Promise<{ rows: Record<string, unknown>[] }>
    >()
    .mockResolvedValue({ rows: [] });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: {
        options: {},
        async connect() {
          return {
            query: (async <R>(text: string, parameters: readonly unknown[]) => {
              const response = await query(text, parameters);
              return {
                rows: response.rows as R[],
                command: "SELECT",
                rowCount: response.rows.length,
              };
            }) as PostgresPoolClient["query"],
            release() {},
          };
        },
        async end() {},
      },
    }),
  });
  return { db, query };
}

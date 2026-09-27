import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
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
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createDriver: () => ({
        async init() {},
        async destroy() {},
        async releaseConnection() {},
        async beginTransaction() {},
        async commitTransaction() {},
        async rollbackTransaction() {},
        async acquireConnection() {
          return {
            async executeQuery<R>(compiled: {
              sql: string;
              parameters: readonly unknown[];
            }) {
              const response = await query(compiled.sql, compiled.parameters);
              return {
                rows: response.rows as R[],
                numAffectedRows: BigInt(response.rows.length),
              };
            },
            async *streamQuery<R>(): AsyncIterableIterator<{ rows: R[] }> {
              throw new Error("No streaming in test driver");
            },
          };
        },
      }),
    },
  });
  return { db, query };
}

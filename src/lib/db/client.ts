import "server-only";
import { Kysely, PostgresDialect, type PostgresPool, type PostgresCursor, type PostgresQueryResult, sql } from "kysely";
import type { Pool } from "pg";
import type { Database } from "@/types/database";
import { getPool } from "./pool";

export type Db = Kysely<Database>;
type Actor = {
  role: "app_guest" | "app_user" | "app_service";
  userId?: string;
};

/** Hyperdrive pools at transaction boundaries. Identity must be transaction-local:
 * never SET a role in an autocommit statement before the actual business query. */
export function scopedPool(pool: Pool, actor: Actor): PostgresPool {
  return {
    options: pool.options,
    async connect() {
      const client = await pool.connect();
      let explicitTransaction = false;
      let broken = false;
      const identify = () => client.query(
        "select set_config('role', $1, true), set_config('app.role', $1, true), set_config('app.user_id', $2, true)",
        [actor.role, actor.userId ?? ""],
      );
      async function runQuery(text: string, parameters: readonly unknown[]) {
          if (typeof text !== "string") throw new Error("Actor-scoped cursors are unsupported");
          const command = text.trim().toLowerCase();
          if (/^(begin|start transaction)\b/.test(command)) {
            explicitTransaction = true;
            const result = await client.query(text, [...parameters]);
            await identify();
            return result;
          }
          if (explicitTransaction) {
            const result = await client.query(text, [...parameters]);
            if (/^(commit|rollback)\s*;?$/.test(command)) explicitTransaction = false;
            return result;
          }
          await client.query("begin");
          try {
            await identify();
            const result = await client.query(text, [...parameters]);
            await client.query("commit");
            return result;
          } catch (error) {
            try { await client.query("rollback"); } catch { broken = true; }
            throw error;
          }
      }
      function query<R>(text: string, parameters: readonly unknown[]): Promise<PostgresQueryResult<R>>;
      function query<R>(cursor: PostgresCursor<R>): PostgresCursor<R>;
      function query<R>(input: string | PostgresCursor<R>, parameters: readonly unknown[] = []): Promise<PostgresQueryResult<R>> | PostgresCursor<R> {
        if (typeof input !== "string") throw new Error("Actor-scoped cursors are unsupported");
        return runQuery(input, parameters).then((result) => ({
          rows: result.rows as R[], rowCount: result.rowCount ?? 0,
          command: result.command as PostgresQueryResult<R>["command"],
        }));
      }
      return {
        query,
        release() {
          // If a caller abandons a transaction, destroy the socket; never reuse it.
          client.release(broken || explicitTransaction || pool.options.maxUses === 1);
        },
      };
    },
    async end() { /* Owned by the local process or the current Worker request. */ },
  };
}

export function database(userId?: string): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: async () =>
        scopedPool(getPool("data"), {
          role: userId ? "app_user" : "app_guest",
          userId,
        }),
    }),
  });
}

/** Call only after authorizing the operation. */
export function serviceDatabase(): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: async () => scopedPool(getPool("data"), { role: "app_service" }),
    }),
  });
}

export { sql };

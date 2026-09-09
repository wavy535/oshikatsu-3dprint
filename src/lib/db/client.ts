import "server-only";
import { Kysely, PostgresDialect, type PostgresPool, sql } from "kysely";
import type { Pool } from "pg";
import type { Database } from "@/types/database";
import { getPool } from "./pool";

export type Db = Kysely<Database>;
type Actor = {
  role: "app_guest" | "app_user" | "app_service";
  userId?: string;
};

/** Every reservation gets an immutable, server-verified actor. A connection is
 * never returned to the shared pool until its role and identity are cleared. */
export function scopedPool(pool: Pool, actor: Actor): PostgresPool {
  return {
    options: pool.options,
    async connect() {
      const client = await pool.connect();
      try {
        await client.query(
          "select set_config('role', $1, false), set_config('app.role', $1, false), set_config('app.user_id', $2, false)",
          [actor.role, actor.userId ?? ""],
        );
      } catch (error) {
        client.release(
          error instanceof Error ? error : new Error("Database context failed"),
        );
        throw error;
      }
      return {
        query: client.query.bind(client),
        release() {
          if (pool.options.maxUses === 1) {
            client.release(true);
            return;
          }
          // Kysely's pool contract has a synchronous release. Reserve the raw
          // client until cleanup finishes; destroy it if cleanup cannot succeed.
          void client
            .query("reset role; reset app.role; reset app.user_id")
            .then(
              () => client.release(),
              (error: Error) => client.release(error),
            );
        },
      };
    },
    async end() {
      /* The process owns the shared pool, not an individual actor. */
    },
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

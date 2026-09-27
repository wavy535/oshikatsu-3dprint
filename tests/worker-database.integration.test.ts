import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { scopedPool, sql } from "@/lib/db/client";
import { Kysely, PostgresDialect } from "kysely";
const { binding } = vi.hoisted(() => ({ binding: { connectionString: "" } }));
vi.mock("@/lib/platform", () => ({ platform: () => ({ DATABASE: binding }) }));
import { getPool } from "@/lib/db/pool";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.TEST_DATABASE === "true";

describe.skipIf(!enabled)("Worker database connections", () => {
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("Run these tests against the local database only");
    binding.connectionString = process.env.DATABASE_URL!;
  });

  afterAll(async () => {
    await Promise.all([getPool("auth").end(), getPool("data").end()]);
    vi.unstubAllEnvs();
  });

  test("a transaction keeps one connection, then closes the socket before another Worker invocation", async () => {
    const removed = vi.fn();
    const pool = getPool("data");
    const actor = (role: "app_user" | "app_service" | "app_guest", userId?: string) => new Kysely({ dialect: new PostgresDialect({ pool: scopedPool(pool, { role, userId }) }) });
    pool.on("remove", removed);
    try {
      await actor("app_user", "11111111-1111-1111-1111-111111111111")
        .transaction()
        .execute(async (db) => {
          const query = sql<{ pid: number; id: string; role: string }>`
            select pg_backend_pid() as pid, app.user_id() as id, current_user as role
          `;
          const first = (await query.execute(db)).rows[0];
          const second = (await query.execute(db)).rows[0];
          expect(first).toEqual(second);
          expect(first).toMatchObject({
            id: "11111111-1111-1111-1111-111111111111",
            role: "app_user",
          });
          expect(removed).not.toHaveBeenCalled();
        });
      // pg emits remove after the connection has actually ended.
      await vi.waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
      expect(pool.totalCount).toBe(0);

      await expect(
        actor("app_service").transaction().execute(async (db) => {
          await sql`select 1 / 0`.execute(db);
        }),
      ).rejects.toThrow();
      await vi.waitFor(() => expect(removed).toHaveBeenCalledTimes(2));
      const guest = await sql<{ role: string; id: string | null }>`
        select current_user as role, app.user_id() as id
      `.execute(actor("app_guest"));
      expect(guest.rows[0]).toEqual({ role: "app_guest", id: null });
      await vi.waitFor(() => expect(removed).toHaveBeenCalledTimes(3));
      expect(pool.totalCount).toBe(0);
    } finally {
      pool.off("remove", removed);
      await pool.end();
    }
  });

  test("the auth pool also closes released connections and can connect again", async () => {
    const pool = getPool("auth");
    const removed = vi.fn();
    pool.on("remove", removed);
    try {
      const first = await pool.query("select pg_backend_pid() as pid");
      await vi.waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
      expect(pool.totalCount).toBe(0);
      const second = await pool.query("select pg_backend_pid() as pid");
      expect(second.rows[0].pid).not.toBe(first.rows[0].pid);
      await vi.waitFor(() => expect(removed).toHaveBeenCalledTimes(2));
      expect(pool.totalCount).toBe(0);
    } finally {
      pool.off("remove", removed);
      await pool.end();
    }
  });
});

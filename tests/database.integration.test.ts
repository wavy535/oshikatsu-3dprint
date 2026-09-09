import { afterAll, expect, test, vi } from "vitest";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { existsSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { scopedPool } from "@/lib/db/client";
import { call } from "@/lib/db/functions";
import type { Database } from "@/types/database";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.TEST_DATABASE === "true";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
const actor = (
  role: "app_user" | "app_guest" | "app_service",
  userId?: string,
) =>
  new Kysely<Database>({
    dialect: new PostgresDialect({ pool: scopedPool(pool, { role, userId }) }),
  });
const buyerId = "11111111-1111-1111-1111-111111111111";
const otherId = "22222222-2222-2222-2222-222222222222";
afterAll(async () => {
  await pool.end();
});

test.skipIf(!enabled)(
  "pooled connections keep concurrent actors isolated and clear their identity before reuse",
  async () => {
    const rows = await Promise.all(
      Array.from({ length: 30 }, (_, i) => {
        const id = i % 2 ? buyerId : otherId;
        return sql<{
          id: string;
          role: string;
        }>`select app.user_id() as id, current_user as role`
          .execute(actor("app_user", id))
          .then((r) => ({ expected: id, actual: r.rows[0] }));
      }),
    );
    rows.forEach((row) =>
      expect(row.actual).toEqual({ id: row.expected, role: "app_user" }),
    );
    const raw = await pool.query(
      "select current_user as role, nullif(current_setting('app.user_id', true), '') as id",
    );
    expect(raw.rows[0]).toEqual({ role: "app_runtime", id: null });
  },
);

test.skipIf(!enabled)(
  "failed queries and rolled-back transactions cannot leak privileges",
  async () => {
    await expect(
      sql`select 1 / 0`.execute(actor("app_service")),
    ).rejects.toThrow();
    await expect(
      actor("app_user", buyerId)
        .transaction()
        .execute(async (db) => {
          await sql`select 1 / 0`.execute(db);
        }),
    ).rejects.toThrow();
    const guest = await sql<{
      id: string | null;
      role: string;
    }>`select app.user_id() as id, current_user as role`.execute(
      actor("app_guest"),
    );
    expect(guest.rows[0]).toEqual({ id: null, role: "app_guest" });
    await expect(
      actor("app_guest").selectFrom("auth_accounts").selectAll().execute(),
    ).rejects.toThrow(/permission denied/);
    await expect(
      actor("app_user", buyerId)
        .selectFrom("auth_sessions")
        .selectAll()
        .execute(),
    ).rejects.toThrow(/permission denied/);
  },
);

test.skipIf(!enabled)(
  "native domain calls preserve scalar and table return values and role restrictions",
  async () => {
    const buyer = actor("app_user", buyerId);
    expect(await call(buyer, "unread_notification_count", {})).toMatchObject({
      error: null,
      data: expect.any(Number),
    });
    const stats = await call(buyer, "creator_public_stats", {
      p_creator_id: otherId,
    });
    expect(stats.error).toBeNull();
    expect(stats.data).toHaveLength(1);
    expect(
      (
        await call(buyer, "claim_notification_emails", {
          p_claim_token: crypto.randomUUID(),
        })
      ).error?.code,
    ).toBe("42501");
    const denied = await buyer
      .selectFrom("addresses")
      .select("user_id")
      .where("user_id", "=", otherId)
      .execute();
    expect(denied).toEqual([]);
  },
);

test.skipIf(!enabled)(
  "business roles cannot bypass row security with table-wide operations",
  async () => {
    const result = await pool.query(`
    select r.role, t.tablename from pg_tables t
    cross join (values ('app_guest'), ('app_user'), ('app_service')) r(role)
    where t.schemaname = 'public'
      and has_table_privilege(r.role, format('public.%I', t.tablename), 'TRUNCATE,REFERENCES,TRIGGER')
  `);
    expect(result.rows).toEqual([]);
  },
);

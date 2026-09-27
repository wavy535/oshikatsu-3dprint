import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sql } from "kysely";
import { d1Database } from "@/lib/db/d1/runtime";
import { call } from "@/lib/db/functions";
import { localD1 } from "./helpers/d1";
const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach((close) => close()));
function setup() {
  const local = localD1();
  closers.push(local.close);
  return {
    local,
    buyer: d1Database(local.binding, { role: "app_user", userId: "buyer" }),
  };
}
test("domain calls preserve scalar/table results and service-only restrictions", async () => {
  const { buyer } = setup();
  expect(await call(buyer, "unread_notification_count", {})).toEqual({
    error: null,
    data: 0,
  });
  const stats = await call(buyer, "creator_public_stats", {
    p_creator_id: "creator",
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
  expect(
    await buyer
      .selectFrom("addresses")
      .selectAll()
      .where("user_id", "=", "other")
      .execute(),
  ).toEqual([]);
});
test("application query builders reject schema changes and raw SQL", async () => {
  const { buyer } = setup();
  await expect(
    sql`DELETE FROM _request_context`.execute(buyer),
  ).rejects.toThrow("audited domain operation");
  await expect(buyer.schema.dropTable("addresses").execute()).rejects.toThrow(
    "audited domain operation",
  );
  await expect(
    buyer.selectFrom("auth_sessions").selectAll().execute(),
  ).resolves.toEqual([]);
  await expect(buyer.transaction().execute(async () => {})).rejects.toThrow(
    "atomicBatch",
  );
});

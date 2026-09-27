import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { d1Database, atomicBatch } from "@/lib/db/d1/runtime";
import { localD1 } from "./helpers/d1";

const close: (() => void)[] = [];
afterEach(() => {
  close.splice(0).forEach((fn) => fn());
});
function setup() {
  const local = localD1();
  close.push(local.close);
  const service = d1Database(local.binding, { role: "app_service" });
  const a = d1Database(local.binding, { role: "app_user", userId: "a" });
  const b = d1Database(local.binding, { role: "app_user", userId: "b" });
  const guest = d1Database(local.binding, { role: "app_guest" });
  return { ...local, service, a, b, guest };
}
describe("D1 authorization boundary", () => {
  it("isolates concurrent readers and clears identity after a failed batch", async () => {
    const { service, a, b, guest, sqlite } = setup();
    await service
      .insertInto("app_users")
      .values([
        { id: "a", name: "a", email: "a@example.test" },
        { id: "b", name: "b", email: "b@example.test" },
      ])
      .execute();
    // Profiles are created by the domain migration; these inserts allow the
    // authorization contract to run independently of auth hooks during the port.
    await service
      .insertInto("profiles")
      .values([
        { id: "a", display_name: "a" },
        { id: "b", display_name: "b" },
      ])
      .onConflict((c) => c.column("id").doNothing())
      .execute();
    await service
      .insertInto("addresses")
      .values([
        {
          id: "aa",
          user_id: "a",
          recipient_name: "A",
          postal_code: "1234567",
          prefecture: "東京",
          city: "千代田",
          address_line: "1",
          phone: "000",
        },
        {
          id: "bb",
          user_id: "b",
          recipient_name: "B",
          postal_code: "1234567",
          prefecture: "東京",
          city: "千代田",
          address_line: "2",
          phone: "000",
        },
      ])
      .execute();
    const rows = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? a : b).selectFrom("addresses").select("id").execute(),
      ),
    );
    rows.forEach((rows, i) =>
      expect(rows.map((row) => row.id)).toEqual([i % 2 ? "aa" : "bb"]),
    );
    expect(await guest.selectFrom("addresses").selectAll().execute()).toEqual(
      [],
    );
    await expect(
      atomicBatch(a, [
        a
          .updateTable("addresses")
          .set({ recipient_name: "changed" })
          .where("id", "=", "aa"),
        a
          .insertInto("addresses")
          .values({
            user_id: "b",
            recipient_name: "forged",
            postal_code: "1234567",
            prefecture: "東京",
            city: "千代田",
            address_line: "3",
            phone: "000",
          }),
      ]),
    ).rejects.toThrow("permission denied");
    expect(
      (
        await a
          .selectFrom("addresses")
          .select("recipient_name")
          .executeTakeFirstOrThrow()
      ).recipient_name,
    ).toBe("A");
    expect(
      sqlite
        .prepare("SELECT role,user_id,internal_depth FROM _request_context")
        .get(),
    ).toEqual({ role: "app_guest", user_id: null, internal_depth: 0 });
    expect(await a.selectFrom("app_users").selectAll().execute()).toEqual([]);
    expect(
      await b
        .updateTable("addresses")
        .set({ recipient_name: "intruder" })
        .where("id", "=", "aa")
        .returning("id")
        .execute(),
    ).toEqual([]);
    expect(
      await b
        .deleteFrom("addresses")
        .where("id", "=", "aa")
        .returning("id")
        .execute(),
    ).toEqual([]);
  });
});

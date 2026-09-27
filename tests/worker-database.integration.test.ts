import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
vi.mock("server-only", () => ({}));
import { d1Database, atomicBatch, type Binding } from "@/lib/db/d1/runtime";
let binding: Binding;
let dispose: (() => Promise<void>) | undefined;
const directory = mkdtempSync(join(tmpdir(), "oshinest-worker-test-"));
beforeAll(async () => {
  const configPath = join(directory, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "oshinest-d1-test",
      compatibility_date: "2026-09-01",
      d1_databases: [
        {
          binding: "DATABASE",
          database_name: "test",
          database_id: "00000000-0000-0000-0000-000000000001",
        },
      ],
    }),
  );
  const proxy = await getPlatformProxy<{ DATABASE: D1Database }>({
    configPath,
    persist: false,
  });
  dispose = proxy.dispose;
  binding = proxy.env.DATABASE;
  for (const file of readdirSync("db/d1")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await binding.batch(
      unstable_splitSqlQuery(readFileSync(`db/d1/${file}`, "utf8")).map((sql) =>
        binding.prepare(sql),
      ),
    );
  }
}, 60000);
afterAll(async () => {
  await dispose?.();
  rmSync(directory, { recursive: true, force: true });
});
test("workerd D1 executes migrations, isolates concurrent identities and rolls back a failed batch", async () => {
  const service = d1Database(binding, { role: "app_service" });
  const actor = (id: string) =>
    d1Database(binding, { role: "app_user", userId: id });
  await service
    .insertInto("app_users")
    .values(
      ["a", "b"].map((id) => ({ id, email: `${id}@test.invalid`, name: id })),
    )
    .execute();
  await service
    .insertInto("addresses")
    .values(
      ["a", "b"].map((id) => ({
        id,
        user_id: id,
        recipient_name: id,
        postal_code: "1234567",
        prefecture: "東京都",
        city: "千代田区",
        address_line: "1",
        phone: "000",
      })),
    )
    .execute();
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      actor(i % 2 ? "a" : "b")
        .selectFrom("addresses")
        .select("id")
        .execute(),
    ),
  );
  results.forEach((rows, i) =>
    expect(rows).toEqual([{ id: i % 2 ? "a" : "b" }]),
  );
  const a = actor("a");
  await expect(
    atomicBatch(a, [
      a
        .updateTable("addresses")
        .set({ recipient_name: "changed" })
        .where("id", "=", "a"),
      a
        .insertInto("addresses")
        .values({
          user_id: "b",
          recipient_name: "forged",
          postal_code: "1234567",
          prefecture: "東京都",
          city: "千代田区",
          address_line: "1",
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
  ).toBe("a");
  const context = await binding.batch([
    binding.prepare("SELECT role,user_id,internal_depth FROM _request_context"),
  ]);
  expect(context[0].results).toEqual([
    { role: "app_guest", user_id: null, internal_depth: 0 },
  ]);
}, 30000);

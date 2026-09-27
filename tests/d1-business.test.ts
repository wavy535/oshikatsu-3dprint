import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import oracle from "../db/oracle/postgres.json";
import { d1Database } from "@/lib/db/d1/runtime";
import { handlers } from "@/lib/db/d1/functions";
import { localD1 } from "./helpers/d1";
const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach((fn) => fn()));
function setup() {
  const local = localD1();
  close.push(local.close);
  return {
    ...local,
    service: d1Database(local.binding, { role: "app_service" }),
  };
}
it("matches every captured PostgreSQL fee and material estimate", async () => {
  const { service } = setup();
  for (const row of oracle.calculations) {
    expect(
      await handlers.calc_print_fee(service, {
        grams: Number(row.grams),
        hours: Number(row.hours),
        parts: row.parts,
      }),
    ).toBe(Number(row.fee));
    expect(
      await handlers.estimate_filament_grams(service, {
        surface_area_cm2: Number(row.grams),
        volume_cm3: Number(row.hours),
      }),
    ).toBe(Number(row.estimated_grams));
  }
});
it("matches checkout snapshots and makes a concurrent request idempotent", async () => {
  const { service, binding } = setup();
  const i = oracle.checkout.inputs;
  await service
    .insertInto("app_users")
    .values(
      [i.buyer, i.creator].map((id) => ({
        id,
        email: `${id}@oracle.invalid`,
        name: "oracle",
      })),
    )
    .execute();
  await service
    .updateTable("profiles")
    .set({ role: "creator" })
    .where("id", "=", i.creator)
    .execute();
  await service
    .insertInto("works")
    .values({
      id: i.work,
      creator_id: i.creator,
      title: "Oracle",
      status: "published",
    })
    .execute();
  await service
    .insertInto("work_variants")
    .values({
      id: i.variant,
      work_id: i.work,
      size_label: "10cm",
      price_jpy: 1200,
      stock: 1,
      is_listed: true,
      is_printable: true,
      est_filament_grams: 50,
      est_print_hours: 2,
      part_count: 3,
    })
    .execute();
  await service
    .insertInto("addresses")
    .values({
      id: i.address,
      user_id: i.buyer,
      recipient_name: "Oracle",
      postal_code: "1234567",
      prefecture: "東京都",
      city: "千代田区",
      address_line: "1",
      phone: "000",
    })
    .execute();
  const cart = await service
    .selectFrom("carts")
    .select("id")
    .where("user_id", "=", i.buyer)
    .executeTakeFirstOrThrow();
  await service
    .insertInto("cart_items")
    .values({ cart_id: cart.id, variant_id: i.variant, quantity: 1 })
    .execute();
  const buyer = d1Database(binding, { role: "app_user", userId: i.buyer });
  const ids = await Promise.all(
    Array.from({ length: 12 }, () =>
      handlers.place_demo_order(buyer, {
        p_address_id: i.address,
        p_request_id: i.request,
      }),
    ),
  );
  expect(new Set(ids).size).toBe(1);
  const id = ids[0];
  expect(
    await service
      .selectFrom("orders")
      .select([
        "status",
        "subtotal_amount",
        "platform_fee_amount",
        "print_cost_amount",
        "shipping_fee_amount",
        "total_amount",
        "is_demo",
      ])
      .where("id", "=", id)
      .executeTakeFirstOrThrow(),
  ).toEqual(oracle.checkout.order);
  expect(
    await service
      .selectFrom("order_items")
      .select([
        "unit_price",
        "quantity",
        "creator_payout_amount",
        "platform_fee_amount",
        "print_cost_amount",
        "print_fee_snapshot",
        "print_assets_snapshot",
      ])
      .where("order_id", "=", id)
      .executeTakeFirstOrThrow(),
  ).toEqual(oracle.checkout.item);
  expect(
    await service
      .selectFrom("print_jobs")
      .select([
        "status",
        "quantity",
        "part_count",
        "batch_count",
        "print_fee_snapshot",
      ])
      .where("order_id", "=", id)
      .executeTakeFirstOrThrow(),
  ).toEqual(oracle.checkout.job);
  expect(
    (
      await service
        .selectFrom("work_variants")
        .select("stock")
        .where("id", "=", i.variant)
        .executeTakeFirstOrThrow()
    ).stock,
  ).toBe(oracle.checkout.stock);
  expect(await handlers.confirm_demo_order(buyer, { p_order_id: id })).toBe(
    false,
  );
  await expect(
    handlers.confirm_demo_order(
      d1Database(binding, { role: "app_user", userId: i.creator }),
      { p_order_id: id },
    ),
  ).rejects.toThrow("permission denied");
});
it("two buyers cannot oversell the last item and downstream failures preserve stock and carts", async () => {
  const { service, binding, sqlite } = setup();
  const i = oracle.checkout.inputs;
  await service
    .insertInto("app_users")
    .values(
      [i.buyer, i.creator, "other-buyer"].map((id) => ({
        id,
        email: `${id}@test.invalid`,
        name: id,
      })),
    )
    .execute();
  await service
    .updateTable("profiles")
    .set({ role: "creator" })
    .where("id", "=", i.creator)
    .execute();
  await service
    .insertInto("works")
    .values({
      id: i.work,
      creator_id: i.creator,
      title: "last item",
      status: "published",
    })
    .execute();
  await service
    .insertInto("work_variants")
    .values({
      id: i.variant,
      work_id: i.work,
      size_label: "10cm",
      price_jpy: 1200,
      stock: 1,
      is_listed: true,
      is_printable: true,
    })
    .execute();
  for (const buyer of [i.buyer, "other-buyer"]) {
    await service
      .insertInto("addresses")
      .values({
        id: `address-${buyer}`,
        user_id: buyer,
        recipient_name: "fixture",
        postal_code: "1234567",
        prefecture: "東京都",
        city: "千代田区",
        address_line: "1",
        phone: "000",
      })
      .execute();
    const cart = await service
      .selectFrom("carts")
      .select("id")
      .where("user_id", "=", buyer)
      .executeTakeFirstOrThrow();
    await service
      .insertInto("cart_items")
      .values({ cart_id: cart.id, variant_id: i.variant, quantity: 1 })
      .execute();
  }
  const order = (id: string) =>
    handlers.place_demo_order(
      d1Database(binding, { role: "app_user", userId: id }),
      { p_address_id: `address-${id}`, p_request_id: crypto.randomUUID() },
    );
  sqlite.exec(
    "CREATE TRIGGER inject_failure BEFORE INSERT ON print_jobs BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  await expect(order(i.buyer)).rejects.toThrow("fixture failure");
  expect(
    await service.selectFrom("orders").select("id").execute(),
  ).toHaveLength(0);
  expect(
    await service.selectFrom("cart_items").select("id").execute(),
  ).toHaveLength(2);
  expect(
    (
      await service
        .selectFrom("work_variants")
        .select("stock")
        .executeTakeFirstOrThrow()
    ).stock,
  ).toBe(1);
  sqlite.exec("DROP TRIGGER inject_failure");
  const results = await Promise.allSettled([
    order(i.buyer),
    order("other-buyer"),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  expect(
    await service.selectFrom("orders").select("id").execute(),
  ).toHaveLength(1);
  expect(
    await service.selectFrom("cart_items").select("id").execute(),
  ).toHaveLength(1);
  expect(
    (
      await service
        .selectFrom("work_variants")
        .select("stock")
        .executeTakeFirstOrThrow()
    ).stock,
  ).toBe(0);
});
it("large inserts split under D1 parameter limits and still roll back every chunk", async () => {
  const { service } = setup();
  const values = Array.from({ length: 150 }, (_, i) => ({
    id: `u${i}`,
    email: `u${i}@test.invalid`,
    name: `u${i}`,
  }));
  await expect(
    service
      .insertInto("app_users")
      .values([...values, values[0]])
      .execute(),
  ).rejects.toThrow("UNIQUE constraint");
  expect(
    await service.selectFrom("app_users").select("id").execute(),
  ).toHaveLength(0);
  expect(
    await service.selectFrom("profiles").select("id").execute(),
  ).toHaveLength(0);
  await service.insertInto("app_users").values(values).execute();
  expect(
    await service.selectFrom("profiles").select("id").execute(),
  ).toHaveLength(150);
});

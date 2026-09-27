// Contracts carried over from db/tests/*.sql. The pinned PostgreSQL tests retain
// the original expected values; these exercise the D1 application boundary.
import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { d1Database } from "@/lib/db/d1/runtime";
import { handlers } from "@/lib/db/d1/functions";
import { localD1 } from "./helpers/d1";
const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach((f) => f()));
async function setup() {
  const local = localD1();
  close.push(local.close);
  const actor = (id?: string) =>
    d1Database(local.binding, {
      role: id ? "app_user" : "app_guest",
      userId: id,
    });
  const service = d1Database(local.binding, { role: "app_service" });
  await service
    .insertInto("app_users")
    .values(
      ["buyer", "other", "creator", "creator2", "admin"].map((id) => ({
        id,
        email: `${id}@test.invalid`,
        name: id,
      })),
    )
    .execute();
  await service
    .updateTable("profiles")
    .set({ role: "creator" })
    .where("id", "in", ["creator", "creator2"])
    .execute();
  await service
    .updateTable("profiles")
    .set({ role: "admin" })
    .where("id", "=", "admin")
    .execute();
  return { ...local, service, actor };
}
test("notification triggers respect ownership, read-only columns and idempotent read state", async () => {
  const { actor, service } = await setup();
  const sender = actor("other"),
    buyer = actor("buyer");
  await service
    .insertInto("notifications")
    .values({
      id: "old",
      user_id: "buyer",
      kind: "message",
      title: "old",
      link_path: "/mypage/messages",
      created_at: "2020-01-01T00:00:00.000Z",
      read_at: "2020-01-01T00:00:00.000Z",
    })
    .execute();
  await sender
    .insertInto("messages")
    .values({
      id: "message",
      sender_id: "other",
      recipient_id: "buyer",
      body: "hello",
    })
    .execute();
  expect(await handlers.mark_all_notifications_read(sender)).toBe(0);
  expect(await handlers.unread_notification_count(buyer)).toBe(1);
  for (const db of [actor(), sender, buyer])
    await expect(
      db
        .insertInto("notifications")
        .values({
          user_id: "buyer",
          kind: "message",
          title: "forged",
          link_path: "/",
        })
        .execute(),
    ).rejects.toThrow("permission denied");
  await expect(
    buyer
      .updateTable("notifications")
      .set({ emailed_at: new Date().toISOString() })
      .execute(),
  ).rejects.toThrow("permission denied");
  await expect(
    buyer
      .updateTable("notifications")
      .set({ email_claimed_until: new Date().toISOString() })
      .execute(),
  ).rejects.toThrow("permission denied");
  expect(await handlers.mark_all_notifications_read(buyer)).toBe(1);
  expect(await handlers.mark_all_notifications_read(buyer)).toBe(0);
  await expect(handlers.purge_old_notifications(buyer)).rejects.toThrow();
  expect(await handlers.purge_old_notifications(actor("admin"))).toBe(1);
  expect(
    await buyer.selectFrom("notifications").select("source_id").execute(),
  ).toEqual([{ source_id: "message" }]);
});
test("deferred digests do not starve instant delivery, leases exclude other workers and expire", async () => {
  const { service, actor } = await setup();
  const hour = (new Date().getUTCHours() + 9) % 24;
  await service
    .insertInto("notification_settings")
    .values({ user_id: "other", digest: "daily", digest_hour: (hour + 1) % 24 })
    .execute();
  await service
    .insertInto("notifications")
    .values(
      Array.from({ length: 201 }, (_, i) => ({
        id: `daily${i}`,
        user_id: "other",
        kind: "announcement" as const,
        title: "daily",
        link_path: "/mypage",
        created_at: new Date(Date.now() - 3600000).toISOString(),
      })),
    )
    .execute();
  await service
    .insertInto("notifications")
    .values({
      id: "instant",
      user_id: "buyer",
      kind: "announcement",
      title: "instant",
      link_path: "/mypage",
    })
    .execute();
  for (const db of [actor(), actor("buyer")])
    await expect(
      handlers.claim_notification_emails(db, { p_claim_token: "forged" }),
    ).rejects.toThrow("permission denied");
  expect(
    (await handlers.notification_email_targets(service, { p_limit: 1 })).map(
      (n) => n.id,
    ),
  ).toEqual(["instant"]);
  expect(
    (
      await handlers.claim_notification_emails(service, {
        p_claim_token: "first",
      })
    ).map((n) => n.id),
  ).toEqual(["instant"]);
  expect(
    await handlers.claim_notification_emails(service, {
      p_claim_token: "second",
    }),
  ).toEqual([]);
  await service
    .updateTable("notifications")
    .set({ email_claimed_until: "2020-01-01T00:00:00.000Z" })
    .where("id", "=", "instant")
    .execute();
  expect(
    (
      await handlers.claim_notification_emails(service, {
        p_claim_token: "second",
      })
    ).map((n) => n.id),
  ).toEqual(["instant"]);
  await service
    .updateTable("notifications")
    .set({ emailed_at: new Date().toISOString() })
    .where("email_claim_token", "=", "first")
    .execute();
  expect(
    (
      await service
        .selectFrom("notifications")
        .select("emailed_at")
        .where("id", "=", "instant")
        .executeTakeFirstOrThrow()
    ).emailed_at,
  ).toBeNull();
  await service
    .updateTable("notifications")
    .set({ emailed_at: new Date().toISOString() })
    .where("email_claim_token", "=", "second")
    .execute();
  await service
    .updateTable("notification_settings")
    .set({ digest_hour: hour })
    .where("user_id", "=", "other")
    .execute();
  expect(
    await handlers.notification_email_targets(service, { p_limit: 20 }),
  ).toHaveLength(20);
  await service
    .insertInto("notification_preferences")
    .values({ user_id: "other", kind: "announcement", email: false })
    .execute();
  expect(
    await handlers.notification_email_targets(service, { p_limit: 20 }),
  ).toHaveLength(0);
});
test("settlement rounding preserves the order total and each creator sees only their own share", async () => {
  const { actor, service } = await setup();
  await service
    .insertInto("works")
    .values([
      { id: "w1", creator_id: "creator", title: "1" },
      { id: "w2", creator_id: "creator2", title: "2" },
    ])
    .execute();
  await service
    .insertInto("orders")
    .values([
      {
        id: "o1",
        buyer_id: "buyer",
        status: "paid",
        subtotal_amount: 126,
        total_amount: 126,
        platform_fee_rate: 0.2,
      },
      {
        id: "o2",
        buyer_id: "buyer",
        status: "paid",
        subtotal_amount: 5,
        total_amount: 5,
        platform_fee_rate: 0.4,
      },
    ])
    .execute();
  const item = {
    quantity: 1,
    print_cost_amount: 0,
    stl_storage_path_snapshot: "",
    filament_material_snapshot: "PLA",
    filament_color_snapshot: "white",
  };
  await service
    .insertInto("order_items")
    .values([
      {
        ...item,
        id: "i1",
        order_id: "o1",
        work_id: "w1",
        creator_id: "creator",
        unit_price: 63,
        creator_payout_amount: 50,
        platform_fee_amount: 13,
      },
      {
        ...item,
        id: "i2",
        order_id: "o1",
        work_id: "w2",
        creator_id: "creator2",
        unit_price: 63,
        creator_payout_amount: 50,
        platform_fee_amount: 13,
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        ...item,
        id: `small${i}`,
        order_id: "o2",
        work_id: "w1",
        creator_id: "creator",
        unit_price: 1,
        creator_payout_amount: 1,
        platform_fee_amount: 0,
      })),
    ])
    .execute();
  const shares = await service
    .selectFrom("creator_item_settlements")
    .select(["item_id", "payout_amount", "fee_amount"])
    .where("order_id", "=", "o1")
    .orderBy("item_id")
    .execute();
  expect(
    shares.map(({ item_id, payout_amount }) => ({ item_id, payout_amount })),
  ).toEqual([
    { item_id: "i1", payout_amount: 51 },
    { item_id: "i2", payout_amount: 50 },
  ]);
  expect(shares.reduce((n, r) => n + (r.fee_amount ?? 0), 0)).toBe(25);
  const own = await actor("creator2")
    .selectFrom("creator_item_settlements")
    .select(["item_id", "payout_amount"])
    .execute();
  expect(own).toEqual([{ item_id: "i2", payout_amount: 50 }]);
  expect(
    (
      await actor("creator2")
        .selectFrom("creator_payout_balances")
        .select("pending_payout")
        .where("creator_id", "=", "creator2")
        .executeTakeFirstOrThrow()
    ).pending_payout,
  ).toBe(50);
  expect(
    await actor("other")
      .selectFrom("creator_item_settlements")
      .selectAll()
      .execute(),
  ).toEqual([]);
  expect(
    await actor().selectFrom("creator_item_settlements").selectAll().execute(),
  ).toEqual([]);
  const small = await service
    .selectFrom("creator_item_settlements")
    .select("payout_amount")
    .where("order_id", "=", "o2")
    .execute();
  expect(small.reduce((n, r) => n + (r.payout_amount ?? 0), 0)).toBe(3);
  expect(
    small.every((r) => r.payout_amount !== null && r.payout_amount >= 0),
  ).toBe(true);
  await service
    .updateTable("orders")
    .set({ print_cost_amount: 8 })
    .where("id", "=", "o2")
    .execute();
  expect(
    (
      await service
        .selectFrom("creator_item_settlements")
        .select("payout_amount")
        .where("order_id", "=", "o2")
        .execute()
    ).reduce((n, r) => n + (r.payout_amount ?? 0), 0),
  ).toBe(-3);
});
test("quote acceptance is restricted to the buyer, creates a private variant, and cancellation is idempotent", async () => {
  const { service, actor } = await setup();
  await service
    .insertInto("orders")
    .values({
      id: "o1",
      buyer_id: "buyer",
      status: "payment_pending",
      subtotal_amount: 1000,
      total_amount: 1000,
    })
    .execute();
  await service
    .insertInto("custom_order_requests")
    .values({
      id: "request",
      requester_id: "buyer",
      creator_id: "creator",
      message: "test",
    })
    .execute();
  await service
    .insertInto("custom_order_quotes")
    .values({
      id: "quote",
      request_id: "request",
      creator_id: "creator",
      buyer_id: "buyer",
      status: "sent",
      price_jpy: 3000,
      est_filament_grams: 80,
      est_print_hours: 4,
    })
    .execute();
  for (const db of [actor(), actor("other"), actor("admin"), service])
    await expect(
      handlers.accept_custom_quote(db, { p_quote_id: "quote" }),
    ).rejects.toThrow("permission denied");
  for (const db of [actor(), actor("other")])
    await expect(
      handlers.cancel_unpaid_order(db, { p_order_id: "o1" }),
    ).rejects.toThrow("permission denied");
  expect(
    await handlers.cancel_unpaid_order(actor("buyer"), { p_order_id: "o1" }),
  ).toBe(true);
  expect(
    await handlers.cancel_unpaid_order(actor("buyer"), { p_order_id: "o1" }),
  ).toBe(false);
  expect(
    await service
      .selectFrom("order_status_history")
      .select("changed_by")
      .where("order_id", "=", "o1")
      .where("status", "=", "cancelled")
      .execute(),
  ).toEqual([{ changed_by: "buyer" }]);
  const variant = await handlers.accept_custom_quote(actor("buyer"), {
    p_quote_id: "quote",
  });
  expect(
    await actor("buyer")
      .selectFrom("work_variants")
      .select(["id", "stock", "is_listed"])
      .where("id", "=", variant)
      .executeTakeFirstOrThrow(),
  ).toEqual({ id: variant, stock: 1, is_listed: false });
  expect(
    await actor("other")
      .selectFrom("work_variants")
      .select("id")
      .where("id", "=", variant)
      .execute(),
  ).toEqual([]);
  expect(
    await actor("buyer")
      .selectFrom("cart_items")
      .select("variant_id")
      .execute(),
  ).toEqual([{ variant_id: variant }]);
});
test("nui sizing uses measured values before estimates and keeps measurements private", async () => {
  const { service, actor } = await setup();
  await service
    .insertInto("works")
    .values({
      id: "work",
      creator_id: "creator",
      title: "fit",
      status: "published",
    })
    .execute();
  await service
    .insertInto("work_variants")
    .values({
      id: "variant",
      work_id: "work",
      size_label: "15cm",
      price_jpy: 1000,
      is_listed: true,
      fit_width_mm: 100,
      fit_height_mm: 150,
      fit_depth_mm: 200,
    })
    .execute();
  await service
    .insertInto("nui_profiles")
    .values([
      { id: "estimated", user_id: "buyer", name: "estimate", height_mm: 150 },
      {
        id: "measured",
        user_id: "buyer",
        name: "measured",
        height_mm: 150,
        sit_height_mm: 140,
        shoulder_width_mm: 70,
        hug_width_mm: 90,
      },
      { id: "rounding", user_id: "buyer", name: "rounding", height_mm: 145 },
    ])
    .execute();
  const fit = (id: string) =>
    handlers.nui_fit_axes(actor("buyer"), {
      p_variant_id: "variant",
      p_nui_id: id,
    });
  expect(
    (await fit("estimated")).map((a) => [a.axis, a.nui_mm, a.verdict]),
  ).toEqual([
    ["width", 85.5, "good"],
    ["height", 132, "good"],
    ["depth", 85.5, "loose"],
  ]);
  expect((await fit("measured")).map((a) => a.nui_mm)).toEqual([90, 140, 90]);
  expect((await fit("rounding"))[0].nui_mm).toBe(82.7);
  expect(
    await handlers.nui_fit_verdict(actor("buyer"), {
      p_variant_id: "variant",
      p_nui_id: "estimated",
    }),
  ).toBe("good");
  expect(
    await handlers.nui_fit_axes(actor("other"), {
      p_variant_id: "variant",
      p_nui_id: "estimated",
    }),
  ).toEqual([]);
  await actor("buyer")
    .updateTable("nui_profiles")
    .set({ height_mm: 120 })
    .where("id", "=", "estimated")
    .execute();
  expect(
    (
      await actor("buyer")
        .selectFrom("nui_profiles")
        .select("nui_size_cm")
        .where("id", "=", "estimated")
        .executeTakeFirstOrThrow()
    ).nui_size_cm,
  ).toBe(10);
});

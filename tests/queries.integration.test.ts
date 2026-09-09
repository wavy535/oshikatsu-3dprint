import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireAdmin: vi.fn(),
  requireCreator: vi.fn(),
  getDatabase: vi.fn(),
  requireUser: vi.fn(),
}));
import {
  requireAdmin,
  requireCreator,
  getDatabase,
  requireUser,
} from "@/lib/auth/guards";
import { scopedPool } from "@/lib/db/client";
import { getPool } from "@/lib/db/pool";
import { listWorks } from "@/lib/works/queries";
import { getWork, getWorkReviewSummary } from "@/lib/works/queries";
import { listOrders, getOrderSummary } from "@/lib/ops/orders-queries";
import { listShipments, getShipmentSummary } from "@/lib/ops/shipping-queries";
import { getQueueSummary, listPrintQueue } from "@/lib/ops/printing-queries";
import { listMyOrders } from "@/lib/orders/queries";
import { listThreads, getThread } from "@/lib/messages/queries";
import { markMessagesReadAction } from "@/lib/messages/actions";
import {
  getSales,
  getOrderSettlement,
  listPayoutRequests,
} from "@/lib/ops/sales-queries";
import { getCreatorDashboard, getPayoutContext } from "@/lib/sales/queries";
import {
  isSalesMonth,
  monthKey,
  monthStart,
  shiftMonth,
} from "@/lib/sales/months";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const enabled = process.env.TEST_DATABASE === "true";
const owner = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
const [adminId, creatorId, otherCreatorId, categoryId, worldviewId] =
  Array.from({ length: 5 }, () => randomUUID());
const works = Array.from({ length: 29 }, () => randomUUID());
let orders: string[] = [];
let failReads = false;
function actor(userId?: string) {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: scopedPool(getPool("data"), {
        role: userId ? "app_user" : "app_guest",
        userId,
      }),
    }),
    plugins: [
      {
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          if (failReads) throw new Error("injected read failure");
          return result;
        },
      },
    ],
  });
}
const filters = {
  creatorId,
  category: categoryId,
  worldview: worldviewId,
  nuiSizeCm: 10,
  sort: "newest" as const,
  page: 1,
};

test("sales months validate input and use Japanese month boundaries", () => {
  expect(monthKey(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
  expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  expect(new Date(monthStart("2027-01")).toISOString()).toBe(
    "2026-12-31T15:00:00.000Z",
  );
  for (const invalid of [
    "2026-00",
    "2026-13",
    "2026-1",
    ["2026-01"],
    undefined,
  ])
    expect(isSalesMonth(invalid)).toBe(false);
});

afterAll(async () => {
  await owner.end();
});
describe.skipIf(!enabled)("bounded backend queries", () => {
  beforeAll(async () => {
    const target = new URL(process.env.MIGRATION_DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.port !== "55432" ||
      target.pathname !== "/oshinest"
    )
      throw new Error("These fixtures require the local Compose database");
    for (const id of [adminId, creatorId, otherCreatorId]) {
      await owner.query("insert into app_users (id,email) values ($1,$2)", [
        id,
        `${id}@example.invalid`,
      ]);
    }
    await owner.query(
      "update profiles set role=case when id=$1 then 'admin'::user_role else 'creator'::user_role end where id=any($2::uuid[])",
      [adminId, [adminId, creatorId, otherCreatorId]],
    );
    await owner.query(
      "insert into tags (id,type,name,slug) values ($1::uuid,'category',$1::text,$1::text),($2::uuid,'worldview',$2::text,$2::text)",
      [categoryId, worldviewId],
    );
    for (let i = 0; i < works.length; i++) {
      const id = works[i];
      await owner.query(
        "insert into works (id,creator_id,title,status) values ($1::uuid,$2,$1::text,$3)",
        [id, creatorId, i === 28 ? "draft" : "published"],
      );
      await owner.query(
        "insert into work_variants (work_id,size_label,nui_size_cm,price_jpy,stock,is_listed,bbox_x_mm,bbox_y_mm,bbox_z_mm) values ($1,'base',$2,1000,10,true,10,10,10)",
        [id, i === 27 ? 20 : 10],
      );
      await owner.query("insert into work_tags values ($1,$2)", [
        id,
        categoryId,
      ]);
      if (i !== 26)
        await owner.query("insert into work_tags values ($1,$2)", [
          id,
          worldviewId,
        ]);
    }
    await owner.query(
      "insert into work_variants (work_id,size_label,price_jpy,stock,is_listed,bbox_x_mm,bbox_y_mm,bbox_z_mm) values ($1,'larger',2000,10,true,10,10,10),($1,'hidden',9000,10,false,10,10,10)",
      [works[0]],
    );
    await owner.query(
      "insert into work_images (work_id,storage_path,sort_order) values ($1,'second.png',1),($1,'first.png',0)",
      [works[0]],
    );
    const rows = await owner.query(
      "insert into orders (buyer_id,status,subtotal_amount,total_amount,is_demo,created_at) select $1,'printing',1000,1000,true,'2099-02-01T00:00:00+09:00'::timestamptz + (g || ' seconds')::interval from generate_series(0,50) g returning id",
      [adminId],
    );
    orders = rows.rows.map((r) => r.id);
    const addItem = async (
      orderId: string,
      itemCreator: string,
      price: number,
    ) => {
      await owner.query(
        "insert into order_items (order_id,work_id,creator_id,unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot) values ($1,$2,$3,$4::int,1,$4::int*0.8,$4::int*0.2,0,'test.stl','PLA','white')",
        [orderId, works[0], itemCreator, price],
      );
    };
    for (let i = 0; i < orders.length; i++)
      await addItem(orders[i], creatorId, i === 0 ? 700 : 1000);
    await addItem(orders[0], otherCreatorId, 300);
    for (const [date, price, status] of [
      ["2099-01-31T14:59:59.999Z", 200, "printing"],
      ["2099-02-28T15:00:00Z", 400, "printing"],
      ["2099-02-10T00:00:00Z", 900, "cancelled"],
    ] as const) {
      const order = await owner.query(
        "insert into orders (buyer_id,status,subtotal_amount,total_amount,is_demo,created_at) values ($1,$2,$3,$3,true,$4) returning id",
        [adminId, status, price, date],
      );
      await addItem(order.rows[0].id, creatorId, price);
    }
  });
  beforeEach(() => {
    failReads = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2099-02-15T00:00:00Z"));
    vi.mocked(getDatabase).mockResolvedValue(actor());
    vi.mocked(requireAdmin).mockResolvedValue({
      db: actor(adminId),
      user: { id: adminId },
    } as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(requireCreator).mockResolvedValue({
      db: actor(creatorId),
      user: { id: creatorId },
    } as Awaited<ReturnType<typeof requireCreator>>);
    vi.mocked(requireUser).mockResolvedValue({
      db: actor(adminId),
      user: { id: adminId },
    } as Awaited<ReturnType<typeof requireUser>>);
  });
  afterAll(async () => {
    vi.useRealTimers();
    await owner.query("delete from orders where buyer_id=$1", [adminId]);
    await owner.query("delete from works where creator_id=$1", [creatorId]);
    await owner.query("delete from tags where id=any($1::uuid[])", [
      [categoryId, worldviewId],
    ]);
    await owner.query("delete from app_users where id=any($1::uuid[])", [
      [adminId, creatorId, otherCreatorId],
    ]);
    await Promise.all([getPool("data").end(), getPool("auth").end()]);
  });

  test("combined tag and size filters paginate without duplicates or missing results", async () => {
    const first = await listWorks(filters);
    const second = await listWorks({ ...filters, page: 2 });
    expect(first.total).toBe(26);
    expect(second.total).toBe(26);
    expect(first.items).toHaveLength(24);
    expect(second.items).toHaveLength(2);
    expect(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
    ).toBe(26);
    expect((await listWorks({ ...filters, worldview: categoryId })).total).toBe(
      0,
    );
  });
  test("search cards retain listed price ranges and the first image", async () => {
    const result = await listWorks({ ...filters, q: works[0] });
    expect(result.items).toHaveLength(1);
    const card = result.items[0];
    expect(card.imagePath).toBe("first.png");
    expect(card.hasRange).toBe(true);
    expect(card.maxPrice! - card.minPrice!).toBe(1000);
    expect(
      (
        await listWorks({
          ...filters,
          q: works[0],
          priceMax: card.minPrice! - 1,
        })
      ).total,
    ).toBe(0);
  });
  test("sales totals cover all orders while details paginate with stable ordering", async () => {
    const first = await getSales("2099-02");
    const last = await getSales("2099-02", 99);
    expect(first.totals).toMatchObject({
      orders: 51,
      finalCount: 0,
      goods: 51000,
      gross: 51000,
      fee: 10200,
      payout: 40800,
    });
    expect(last.totals).toEqual(first.totals);
    expect(first.settlements).toHaveLength(50);
    expect(last.settlements).toHaveLength(1);
    expect(last.page).toBe(2);
    expect(first.pageCount).toBe(2);
    expect(
      new Set([...first.settlements, ...last.settlements].map((r) => r.orderId))
        .size,
    ).toBe(51);
    expect(first.creators.find((r) => r.creatorId === creatorId)).toMatchObject(
      {
        orderCount: 51,
        goods: 50700,
        fee: 10140,
        payout: 40560,
        paidOut: 0,
        requested: 0,
      },
    );
    expect(
      first.creators.find((r) => r.creatorId === otherCreatorId),
    ).toMatchObject({ orderCount: 1, goods: 300, fee: 60, payout: 240 });
    expect(first.trend.at(-1)).toMatchObject({
      key: "2099-02",
      count: 51,
      pool: 51000,
    });
  });
  test("creator totals respect month boundaries, exclude cancellations and isolate other creators", async () => {
    const dashboard = await getCreatorDashboard("2099-02");
    expect(dashboard).toMatchObject({
      goods: 50700,
      units: 51,
      unitsChange: 50,
      goodsChangePct: 25250,
      monthPayout: 40560,
    });
    expect(dashboard.trend).toHaveLength(8);
    expect(dashboard.trend.at(-2)).toMatchObject({
      key: "2099-01",
      goods: 200,
    });
    expect(dashboard.recent).toHaveLength(8);
    expect(dashboard.recent.every((r) => r.creator_id === creatorId)).toBe(
      true,
    );
    expect(dashboard.recent[0].goods_amount).toBe(400);
  });
  test("an empty sales period has zero totals and one empty page", async () => {
    const result = await getSales("2098-01");
    expect(result.totals).toMatchObject({
      orders: 0,
      goods: 0,
      fee: 0,
      payout: 0,
    });
    expect(result.settlements).toEqual([]);
    expect(result.creators).toEqual([]);
    expect(result.pageCount).toBe(1);
  });
  test("read failures are surfaced instead of reporting no results or zero sales", async () => {
    failReads = true;
    await expect(listWorks(filters)).rejects.toThrow(
      "作品を検索できませんでした",
    );
    await expect(getSales("2099-02")).rejects.toThrow("injected read failure");
    await expect(getCreatorDashboard("2099-02")).rejects.toThrow(
      "injected read failure",
    );
    await expect(getPayoutContext()).rejects.toThrow("injected read failure");
    await expect(listPayoutRequests()).rejects.toThrow("injected read failure");
    await expect(getOrderSettlement(orders[0])).rejects.toThrow(
      "injected read failure",
    );
  });
});

describe.skipIf(!enabled)("paged lists and conversation history", () => {
  // This group has its own fixtures because the preceding group's hooks clean up.
  const [viewer, sender, oldSender] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const work = randomUUID();
  const orderIds: string[] = [];
  const messageIds: string[] = [];
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    types: enabled ? getPool("data").options.types : undefined,
  });
  const setup = new pg.Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: scopedPool(pool, { role: "app_user", userId: viewer }),
    }),
  });
  beforeAll(async () => {
    const target = new URL(process.env.MIGRATION_DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.port !== "55432"
    )
      throw new Error("Local database required");
    for (const id of [viewer, sender, oldSender])
      await setup.query("insert into app_users (id,email) values ($1,$2)", [
        id,
        `${id}@example.invalid`,
      ]);
    await setup.query(
      "update profiles set role='admin', display_name=$1::text where id=$1::uuid",
      [viewer],
    );
    await setup.query(
      "insert into works (id,creator_id,title,status) values ($1::uuid,$2,$1::text,'published')",
      [work, sender],
    );
    await setup.query(
      "insert into work_variants (work_id,size_label,price_jpy,stock,is_listed,bbox_x_mm,bbox_y_mm,bbox_z_mm) values ($1,'base',1000,100,true,10,10,10)",
      [work],
    );
    const result = await setup.query(
      "insert into orders (buyer_id,status,subtotal_amount,total_amount,is_demo,created_at) select $1,'printing',1000,1000,true,'2035-01-01'::timestamptz from generate_series(1,51) returning id",
      [viewer],
    );
    orderIds.push(...result.rows.map((r) => r.id));
    for (const id of orderIds) {
      await setup.query(
        "insert into order_items (order_id,work_id,creator_id,unit_price,quantity,creator_payout_amount,platform_fee_amount,print_cost_amount,stl_storage_path_snapshot,filament_material_snapshot,filament_color_snapshot) values ($1,$2,$3,1000,1,800,200,0,'test.stl','PLA','white')",
        [id, work, sender],
      );
      await setup.query(
        "insert into print_jobs (order_id,order_item_id,status,job_no) select $1,id,'queued',$3 from order_items where order_id=$1 and work_id=$2",
        [id, work, `${work}-${id}`],
      );
      await setup.query(
        "insert into shipments (order_id,carrier,tracking_number,shipped_at,shipping_fee_jpy) values ($1,'yamato',$2,'2035-01-02',100)",
        [id, work],
      );
    }
    const messages = await setup.query(
      "insert into messages (sender_id,recipient_id,body,created_at) select $1,$2,'message '||g,'2035-01-01'::timestamptz + (g || ' microseconds')::interval from generate_series(1,501) g returning id",
      [sender, viewer],
    );
    messageIds.push(...messages.rows.map((r) => r.id));
    await setup.query(
      "insert into messages (sender_id,recipient_id,body,created_at) values ($1,$2,'old conversation','2030-01-01'),($2,$1,'sent message','2029-01-01')",
      [oldSender, viewer],
    );
  });
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      db,
      user: { id: viewer },
    } as Awaited<ReturnType<typeof requireUser>>);
    vi.mocked(requireAdmin).mockResolvedValue({
      db,
      user: { id: viewer },
    } as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(getDatabase).mockResolvedValue(db);
  });
  afterAll(async () => {
    await setup.query("delete from orders where buyer_id=$1", [viewer]);
    await setup.query("delete from works where id=$1", [work]);
    await setup.query("delete from app_users where id=any($1::uuid[])", [
      [viewer, sender, oldSender],
    ]);
    await Promise.all([pool.end(), setup.end()]);
  });

  test("order, job and shipment search happens before paging, with stable ties", async () => {
    for (const list of [
      (page: string) => listOrders({ q: work, status: "all", page }),
      (page: string) => listPrintQueue({ q: work, status: "all", page }),
      (page: string) => listShipments({ q: work, page }),
    ]) {
      const first = await list("1");
      const second = await list("2");
      expect(first.items).toHaveLength(50);
      expect(first.hasNext).toBe(true);
      expect(second.items).toHaveLength(1);
      expect(second.hasNext).toBe(false);
      expect(
        new Set([...first.items, ...second.items].map((r) => r.id)).size,
      ).toBe(51);
    }
    const first = await listMyOrders(1);
    const second = await listMyOrders(2);
    expect(first.items).toHaveLength(30);
    expect(second.items).toHaveLength(21);
    expect(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
    ).toBe(51);
    expect(
      (await listOrders({ status: "all", q: orderIds[0] })).items,
    ).toHaveLength(1);
  });

  test("summaries execute as aggregates and details retain computed prices", async () => {
    const [orders, shipments, queue, detail, reviews, payouts] =
      await Promise.all([
        getOrderSummary(),
        getShipmentSummary(),
        getQueueSummary(),
        getWork(work),
        getWorkReviewSummary(work),
        listPayoutRequests(),
      ]);
    expect(orders.open).toBeGreaterThanOrEqual(0);
    expect(shipments.total).toBeGreaterThanOrEqual(51);
    expect(shipments.avgLeadDays).toEqual(expect.any(Number));
    expect(queue.queued).toBeGreaterThanOrEqual(51);
    expect(detail?.work_variants[0].buyer_total_jpy).toBeGreaterThan(0);
    expect(reviews).toEqual({ count: 0, avg: null, latest: [] });
    expect(payouts.summary.total).toBeGreaterThanOrEqual(
      payouts.requests.length,
    );
  });

  test("all conversations and unread counts survive more than 500 recent messages", async () => {
    const threads = await listThreads();
    expect(threads.items).toHaveLength(2);
    expect(threads.items[0]).toMatchObject({
      counterpartId: sender,
      lastBody: "message 501",
      unread: 501,
    });
    expect(threads.items[1]).toMatchObject({
      counterpartId: oldSender,
      unread: 1,
    });
    expect(threads.totalUnread).toBe(502);
  });

  test("message cursors preserve microsecond ties and new arrivals; reading is side-effect free", async () => {
    const first = await getThread(sender);
    expect(first?.messages).toHaveLength(50);
    expect(first?.messages.at(-1)?.body).toBe("message 501");
    expect(first?.messages[0].body).toBe("message 452");
    expect(first?.olderCursor).toBeTruthy();
    await setup.query(
      "insert into messages (sender_id,recipient_id,body,created_at) values ($1,$2,'new arrival','2036-01-01')",
      [sender, viewer],
    );
    const second = await getThread(sender, first!.olderCursor!);
    expect(second?.messages.at(-1)?.body).toBe("message 451");
    expect(
      new Set([...first!.messages, ...second!.messages].map((m) => m.id)).size,
    ).toBe(100);
    const unread = await setup.query(
      "select count(*)::int as count from messages where recipient_id=$1 and read_at is null",
      [viewer],
    );
    expect(unread.rows[0].count).toBe(503);
    const wrong = await setup.query(
      "select id from messages where sender_id=$1 and recipient_id=$2",
      [viewer, oldSender],
    );
    await markMessagesReadAction([
      ...first!.messages.slice(0, 49).map((m) => m.id),
      wrong.rows[0].id,
    ]);
    const read = await setup.query(
      "select count(*)::int as count from messages where recipient_id=$1 and read_at is not null",
      [viewer],
    );
    expect(read.rows[0].count).toBe(49);
    const denied = await setup.query(
      "select read_at from messages where id=$1",
      [wrong.rows[0].id],
    );
    expect(denied.rows[0].read_at).toBeNull();
  });
});

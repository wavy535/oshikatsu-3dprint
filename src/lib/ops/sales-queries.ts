import { readPage } from "@/lib/db/result";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import { sql } from "kysely";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import { SALES_ORDER_STATUSES } from "@/lib/ops/labels";
import { monthKey, monthStart, shiftMonth } from "@/lib/sales/months";
import type { Tables, OrderStatus } from "@/types/db";

// =============================================================================
// 売上・手数料
// =============================================================================

/**
 * 売上の集計。運営の決め（2026-09-08）:
 *
 *   手数料 = (購入者の支払い − 印刷の実費 − 送料の実費) × 料率（20%）
 *   クリエイター受取 = 残り
 *
 * 式は DB の `order_settlements` ビューだけが持つ。発送が終わって実費が
 * そろった注文は「確定」、それまでは請求した代行費・購入者負担の送料で「見込み」。
 * 料率は注文ごとのスナップショット（orders.platform_fee_rate）なので、
 * 料率を変えても過去の注文の精算は動かない。
 */
export type Settlement = {
  orderId: string;
  status: OrderStatus;
  orderedAt: string;
  rate: number;
  gross: number;
  goods: number;
  printFee: number;
  printActual: number | null;
  shippingCharged: number;
  shippingActual: number | null;
  printUsed: number;
  shippingUsed: number;
  pool: number;
  fee: number;
  payout: number;
  isFinal: boolean;
};

type SettlementRow = Tables<"order_settlements">;

function toSettlement(r: SettlementRow): Settlement {
  return {
    orderId: r.order_id!,
    status: r.status!,
    orderedAt: r.ordered_at!,
    rate: Number(r.platform_fee_rate ?? 0),
    gross: r.gross_amount ?? 0,
    goods: r.goods_amount ?? 0,
    printFee: r.print_fee_amount ?? 0,
    printActual: r.print_actual_amount,
    shippingCharged: r.shipping_charged_amount ?? 0,
    shippingActual: r.shipping_actual_amount,
    printUsed: r.print_cost_used ?? 0,
    shippingUsed: r.shipping_used ?? 0,
    pool: r.pool_amount ?? 0,
    fee: r.fee_amount ?? 0,
    payout: r.payout_amount ?? 0,
    isFinal: !!r.is_final,
  };
}

export async function getOrderSettlement(orderId: string) {
  const { db } = await requireAdmin();
  const data = await db
    .selectFrom("order_settlements")
    .selectAll("order_settlements")
    .where("order_settlements.order_id", "=", orderId)
    .executeTakeFirst();
  return data ? toSettlement(data) : null;
}

const SALES_PAGE_SIZE = 50;

export async function getSales(month: string, requestedPage = 1) {
  const { db } = await requireAdmin();
  const allSales = db
    .selectFrom("order_settlements")
    .where("status", "in", SALES_ORDER_STATUSES);
  const selected =
    month === "all"
      ? allSales
      : allSales
          .where("ordered_at", ">=", monthStart(month))
          .where("ordered_at", "<", monthStart(shiftMonth(month, 1)));
  const currentMonth = monthKey();
  const months = Array.from({ length: 6 }, (_, i) =>
    shiftMonth(currentMonth, i - 5),
  );

  // 按分済みの精算値を集計する。ページ内の注文だけを合計しない。
  const creatorTotals = db
    .selectFrom("creator_item_settlements")
    .where("order_id", "in", selected.select("order_id"))
    .select([
      "creator_id as creatorId",
      sql<string>`coalesce(creator_name, '—')`.as("name"),
      sql<number>`count(distinct order_id)`.as("orderCount"),
      sql<number>`coalesce(sum(goods_amount), 0)`.as("goods"),
      sql<number>`coalesce(sum(fee_amount), 0)`.as("fee"),
      sql<number>`coalesce(sum(payout_amount), 0)`.as("payout"),
    ])
    .groupBy(["creator_id", "creator_name"])
    .as("sales");
  const payoutTotals = db
    .selectFrom("payout_requests")
    .select([
      "creator_id",
      sql<number>`coalesce(sum(amount) filter (where status = 'paid'), 0)`.as(
        "paidOut",
      ),
      sql<number>`coalesce(sum(amount) filter (where status in ('requested', 'processing')), 0)`.as(
        "requested",
      ),
    ])
    .groupBy("creator_id")
    .as("payouts");

  const [totals, creators, monthly, rule] = await Promise.all([
    selected
      .select([
        sql<number>`count(*)`.as("orders"),
        sql<number>`count(*) filter (where is_final)`.as("finalCount"),
        sql<number>`coalesce(sum(gross_amount), 0)`.as("gross"),
        sql<number>`coalesce(sum(goods_amount), 0)`.as("goods"),
        sql<number>`coalesce(sum(print_fee_amount), 0)`.as("printFee"),
        sql<number>`coalesce(sum(print_cost_used), 0)`.as("printUsed"),
        sql<number>`coalesce(sum(shipping_charged_amount), 0)`.as(
          "shippingCharged",
        ),
        sql<number>`coalesce(sum(shipping_used), 0)`.as("shippingUsed"),
        sql<number>`coalesce(sum(pool_amount), 0)`.as("pool"),
        sql<number>`coalesce(sum(fee_amount), 0)`.as("fee"),
        sql<number>`coalesce(sum(payout_amount), 0)`.as("payout"),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom(creatorTotals)
      .leftJoin(payoutTotals, "payouts.creator_id", "sales.creatorId")
      .selectAll("sales")
      .select((eb) => [
        eb.fn.coalesce("payouts.paidOut", eb.val(0)).as("paidOut"),
        eb.fn.coalesce("payouts.requested", eb.val(0)).as("requested"),
      ])
      .orderBy("sales.goods", "desc")
      .orderBy("sales.creatorId", "asc")
      .execute(),
    allSales
      .select([
        sql<string>`to_char(ordered_at at time zone 'Asia/Tokyo', 'YYYY-MM')`.as(
          "key",
        ),
        sql<number>`coalesce(sum(pool_amount), 0)`.as("pool"),
        sql<number>`coalesce(sum(fee_amount), 0)`.as("fee"),
        sql<number>`count(*)`.as("count"),
        sql<number>`count(*) filter (where is_final)`.as("finalCount"),
      ])
      .where("ordered_at", ">=", monthStart(months[0]))
      .where("ordered_at", "<", monthStart(shiftMonth(currentMonth, 1)))
      .groupBy("key")
      .execute(),
    db
      .selectFrom("print_pricing_rules")
      .select("platform_fee_rate")
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow(),
  ]);
  const pageCount = Math.max(1, Math.ceil(totals.orders / SALES_PAGE_SIZE));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pageCount)
      : 1;
  const rows = await selected
    .selectAll()
    .orderBy("ordered_at", "desc")
    .orderBy("order_id", "asc")
    .limit(SALES_PAGE_SIZE)
    .offset((page - 1) * SALES_PAGE_SIZE)
    .execute();
  const byMonth = new Map(monthly.map((row) => [row.key, row]));
  return {
    totals,
    creators,
    settlements: rows.map(toSettlement),
    page,
    pageCount,
    trend: months.map((key) => ({
      key,
      pool: byMonth.get(key)?.pool ?? 0,
      fee: byMonth.get(key)?.fee ?? 0,
      count: byMonth.get(key)?.count ?? 0,
      finalCount: byMonth.get(key)?.finalCount ?? 0,
    })),
    feeRate: Number(rule.platform_fee_rate),
  };
}

// =============================================================================
// 払込管理
// =============================================================================

/** Load accounts only for the displayed requests; aggregate totals across every page. */
export async function listPayoutRequests(requestedPage?: unknown) {
  const { db } = await requireAdmin();
  const [page, summary] = await Promise.all([
    readPage(
      db
        .selectFrom("payout_requests")
        .select((eb) => [
          "payout_requests.id",
          "payout_requests.creator_id",
          "payout_requests.amount",
          "payout_requests.status",
          "payout_requests.requested_at",
          "payout_requests.processed_at",
          jsonObjectFrom(
            eb
              .selectFrom("profiles")
              .select("display_name")
              .whereRef("profiles.id", "=", "payout_requests.creator_id"),
          ).as("profiles"),
          jsonObjectFrom(
            eb
              .selectFrom("payout_accounts")
              .select([
                "bank_name",
                "branch_name",
                "account_type",
                "account_number",
                "account_holder_name",
              ])
              .whereRef(
                "payout_accounts.creator_id",
                "=",
                "payout_requests.creator_id",
              ),
          ).as("account"),
        ])
        .orderBy("requested_at", "desc")
        .orderBy("id", "desc"),
      requestedPage,
      50,
    ),
    db
      .selectFrom("payout_requests")
      .select([
        sql<number>`count(*)::integer`.as("total"),
        sql<number>`count(*) filter (where status in ('requested','processing'))::integer`.as(
          "open",
        ),
        sql<number>`coalesce(sum(amount) filter (where status in ('requested','processing')), 0)::float8`.as(
          "openTotal",
        ),
        sql<number>`coalesce(sum(amount) filter (where status = 'paid'), 0)::float8`.as(
          "paidTotal",
        ),
        sql<number>`(select coalesce(sum(greatest(available_amount, 0)), 0)::float8 from creator_payout_balances)`.as(
          "owed",
        ),
      ])
      .executeTakeFirstOrThrow(),
  ]);
  return {
    requests: page.items,
    page: page.page,
    hasNext: page.hasNext,
    summary,
  };
}

import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";
import { monthKey, SALES_ORDER_STATUSES } from "@/lib/ops/labels";
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
  const { data } = await queryResult(
    db
      .selectFrom("order_settlements")
      .selectAll("order_settlements")
      .where("order_settlements.order_id", "=", orderId)
      .executeTakeFirst(),
  );
  return data ? toSettlement(data) : null;
}

export async function getSales(month: string | "all") {
  const { db } = await requireAdmin();

  let from: string | null = null;
  let to: string | null = null;
  if (month !== "all") {
    const [y, m] = month.split("-").map(Number);
    from = new Date(y, m - 1, 1).toISOString();
    to = new Date(y, m, 1).toISOString();
  }

  let settlementsQuery = db
    .selectFrom("order_settlements")
    .selectAll("order_settlements")
    .where(
      sql<boolean>`${sql.ref("order_settlements.status")} = any(${[...SALES_ORDER_STATUSES]})`,
    );
  if (from && to)
    settlementsQuery = settlementsQuery
      .where("order_settlements.ordered_at", ">=", from)
      .where("order_settlements.ordered_at", "<", to);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    { data: rows },
    { data: trendRows },
    { data: payouts },
    { data: rule },
  ] = await Promise.all([
    queryResult(
      settlementsQuery
        .orderBy("order_settlements.ordered_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("order_settlements")
        .select([
          "order_settlements.ordered_at",
          "order_settlements.pool_amount",
          "order_settlements.fee_amount",
          "order_settlements.is_final",
        ])
        .where(
          sql<boolean>`${sql.ref("order_settlements.status")} = any(${[...SALES_ORDER_STATUSES]})`,
        )
        .where("order_settlements.ordered_at", ">=", sixMonthsAgo.toISOString())
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("payout_requests")
        .select([
          "payout_requests.creator_id",
          "payout_requests.amount",
          "payout_requests.status",
        ])
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_pricing_rules")
        .select(["print_pricing_rules.platform_fee_rate"])
        .where("print_pricing_rules.is_active", "=", true)
        .executeTakeFirst(),
    ),
  ]);

  const settlements = (rows ?? []).map(toSettlement);
  const orderIds = settlements.map((s) => s.orderId);
  type SalesItem = Pick<
    Tables<"creator_item_settlements">,
    | "order_id"
    | "creator_id"
    | "goods_amount"
    | "fee_amount"
    | "payout_amount"
    | "creator_name"
  >;
  let items: SalesItem[] = [];
  if (orderIds.length) {
    const { data, error } = await queryResult(
      db
        .selectFrom("creator_item_settlements")
        .select([
          "creator_item_settlements.order_id",
          "creator_item_settlements.creator_id",
          "creator_item_settlements.goods_amount",
          "creator_item_settlements.fee_amount",
          "creator_item_settlements.payout_amount",
          "creator_item_settlements.creator_name",
        ])
        .where(
          sql<boolean>`${sql.ref("creator_item_settlements.order_id")} = any(${orderIds})`,
        )
        .execute(),
    );
    if (error) throw new Error("クリエイター別の精算を取得できませんでした");
    items = data ?? [];
  }

  const sum = (pick: (s: Settlement) => number | null) =>
    settlements.reduce((n, s) => n + (pick(s) ?? 0), 0);

  const totals = {
    orders: settlements.length,
    finalCount: settlements.filter((s) => s.isFinal).length,
    gross: sum((s) => s.gross),
    goods: sum((s) => s.goods),
    printFee: sum((s) => s.printFee),
    printUsed: sum((s) => s.printUsed),
    shippingCharged: sum((s) => s.shippingCharged),
    shippingUsed: sum((s) => s.shippingUsed),
    pool: sum((s) => s.pool),
    fee: sum((s) => s.fee),
    payout: sum((s) => s.payout),
  };

  // 按分済みの同じDBビューを運営・クリエイター・受取残高で共用する。
  const byCreator = new Map<
    string,
    {
      creatorId: string;
      name: string;
      orders: Set<string>;
      goods: number;
      fee: number;
      payout: number;
    }
  >();
  for (const item of items) {
    if (!item.creator_id || !item.order_id)
      throw new Error("精算の明細が不正です");
    const row = byCreator.get(item.creator_id) ?? {
      creatorId: item.creator_id,
      name: item.creator_name ?? "—",
      orders: new Set<string>(),
      goods: 0,
      fee: 0,
      payout: 0,
    };
    row.orders.add(item.order_id);
    row.goods += item.goods_amount ?? 0;
    row.fee += item.fee_amount ?? 0;
    row.payout += item.payout_amount ?? 0;
    byCreator.set(item.creator_id, row);
  }
  const paidOut = new Map<string, number>();
  const requested = new Map<string, number>();
  for (const p of payouts ?? []) {
    if (p.status === "paid")
      paidOut.set(p.creator_id, (paidOut.get(p.creator_id) ?? 0) + p.amount);
    if (p.status === "requested" || p.status === "processing") {
      requested.set(
        p.creator_id,
        (requested.get(p.creator_id) ?? 0) + p.amount,
      );
    }
  }
  const creators = [...byCreator.values()]
    .map((c) => ({
      ...c,
      orderCount: c.orders.size,
      paidOut: paidOut.get(c.creatorId) ?? 0,
      requested: requested.get(c.creatorId) ?? 0,
    }))
    .sort((a, b) => b.goods - a.goods);

  // 月別（直近6か月）
  const trend = new Map<
    string,
    { pool: number; fee: number; count: number; finalCount: number }
  >();
  for (let k = 0; k < 6; k++) {
    const d = new Date(sixMonthsAgo);
    d.setMonth(d.getMonth() + k);
    trend.set(monthKey(d), { pool: 0, fee: 0, count: 0, finalCount: 0 });
  }
  for (const r of trendRows ?? []) {
    const t = trend.get(monthKey(new Date(r.ordered_at!)));
    if (!t) continue;
    t.pool += r.pool_amount ?? 0;
    t.fee += r.fee_amount ?? 0;
    t.count += 1;
    if (r.is_final) t.finalCount += 1;
  }

  return {
    totals,
    creators,
    settlements,
    trend: [...trend.entries()].map(([key, v]) => ({ key, ...v })),
    feeRate: Number(rule?.platform_fee_rate ?? 0),
  };
}

// =============================================================================
// 払込管理
// =============================================================================

/** 振込申請の一覧（口座つき）と、クリエイターごとの残高。 */
export async function listPayoutRequests() {
  const { db } = await requireAdmin();
  const [{ data: requests }, { data: accounts }, { data: balances }] =
    await Promise.all([
      queryResult(
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
                .selectFrom("profiles as r28")
                .select(["r28.display_name"])
                .whereRef("r28.id", "=", "payout_requests.creator_id"),
            ).as("profiles"),
          ])
          .orderBy("payout_requests.requested_at", "desc")
          .execute(),
      ),
      queryResult(
        db
          .selectFrom("payout_accounts")
          .select([
            "payout_accounts.creator_id",
            "payout_accounts.bank_name",
            "payout_accounts.branch_name",
            "payout_accounts.account_type",
            "payout_accounts.account_number",
            "payout_accounts.account_holder_name",
          ])
          .execute(),
      ),
      queryResult(
        db
          .selectFrom("creator_payout_balances")
          .select([
            "creator_payout_balances.creator_id",
            "creator_payout_balances.available_amount",
          ])
          .execute(),
      ),
    ]);
  const accountById = new Map((accounts ?? []).map((a) => [a.creator_id, a]));
  return {
    requests: (requests ?? []).map((r) => ({
      ...r,
      account: accountById.get(r.creator_id) ?? null,
    })),
    balances: balances ?? [],
  };
}

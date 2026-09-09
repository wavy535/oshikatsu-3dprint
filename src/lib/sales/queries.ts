import { jsonObjectFrom } from "kysely/helpers/postgres";
import { sql } from "kysely";
import "server-only";

import { requireCreator } from "@/lib/auth/guards";
import { SALES_ORDER_STATUSES } from "@/lib/ops/labels";
import { monthStart, shiftMonth } from "./months";

/** 売上は月ごとの集計値と直近8明細だけを読み、精算式はDBビューを共用する。 */
export async function getCreatorDashboard(month: string) {
  const { db, user } = await requireCreator();
  const months = Array.from({ length: 8 }, (_, i) => shiftMonth(month, i - 7));
  const itemsQuery = db
    .selectFrom("creator_item_settlements")
    .where("creator_id", "=", user.id)
    .where("status", "in", SALES_ORDER_STATUSES);
  const [monthly, recent, balance, account, followers] = await Promise.all([
    itemsQuery
      .select([
        sql<string>`to_char(ordered_at at time zone 'Asia/Tokyo', 'YYYY-MM')`.as(
          "key",
        ),
        sql<number>`coalesce(sum(goods_amount), 0)`.as("goods"),
        sql<number>`coalesce(sum(payout_amount), 0)`.as("payout"),
        sql<number>`coalesce(sum(quantity), 0)`.as("units"),
      ])
      .where("ordered_at", ">=", monthStart(months[0]))
      .where("ordered_at", "<", monthStart(shiftMonth(month, 1)))
      .groupBy("key")
      .execute(),
    itemsQuery
      .selectAll()
      .orderBy("ordered_at", "desc")
      .orderBy("item_id", "asc")
      .limit(8)
      .execute(),
    db
      .selectFrom("creator_payout_balances")
      .selectAll()
      .where("creator_id", "=", user.id)
      .executeTakeFirst(),
    db
      .selectFrom("payout_accounts")
      .select(["bank_name", "branch_name", "account_type", "account_number"])
      .where("creator_id", "=", user.id)
      .executeTakeFirst(),
    db
      .selectFrom("creator_follows")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("creator_id", "=", user.id)
      .executeTakeFirstOrThrow(),
  ]);
  const byMonth = new Map(monthly.map((row) => [row.key, row]));
  const empty = { goods: 0, payout: 0, units: 0 };
  const current = byMonth.get(month) ?? empty;
  const previous = byMonth.get(shiftMonth(month, -1)) ?? empty;
  return {
    month,
    goods: current.goods,
    goodsChangePct:
      previous.goods > 0
        ? Math.round(((current.goods - previous.goods) / previous.goods) * 100)
        : null,
    units: current.units,
    unitsChange: current.units - previous.units,
    monthPayout: current.payout,
    followers: followers.count,
    trend: months.map((key) => ({
      key,
      goods: byMonth.get(key)?.goods ?? 0,
      payout: byMonth.get(key)?.payout ?? 0,
    })),
    recent,
    balance,
    account,
  };
}

/** 払込ページ: 残高・口座・申請履歴。 */
export async function getPayoutContext() {
  const { db, user } = await requireCreator();
  const [balance, account, requests, charges] = await Promise.all([
    db
      .selectFrom("creator_payout_balances")
      .selectAll("creator_payout_balances")
      .where("creator_payout_balances.creator_id", "=", user.id)
      .executeTakeFirst(),
    db
      .selectFrom("payout_accounts")
      .selectAll("payout_accounts")
      .where("payout_accounts.creator_id", "=", user.id)
      .executeTakeFirst(),
    db
      .selectFrom("payout_requests")
      .selectAll("payout_requests")
      .where("payout_requests.creator_id", "=", user.id)
      .orderBy("payout_requests.requested_at", "desc")
      .execute(),
    db
      .selectFrom("revision_requests")
      .select((eb) => [
        "revision_requests.id",
        "revision_requests.revision_no",
        "revision_requests.reprint_fee_jpy",
        "revision_requests.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("works as r0")
            .select(["r0.title"])
            .whereRef("r0.id", "=", "revision_requests.work_id"),
        ).as("works"),
      ])
      .where("revision_requests.creator_id", "=", user.id)
      .where("revision_requests.charged_to_creator", "=", true)
      .where("revision_requests.status", "!=", "cancelled")
      .orderBy("revision_requests.created_at", "desc")
      .execute(),
  ]);
  return {
    balance: balance ?? null,
    account: account ?? null,
    requests,
    charges,
  };
}

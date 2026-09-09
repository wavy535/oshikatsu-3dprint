import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult, countResult } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";

import { requireCreator } from "@/lib/auth/guards";
import { monthKey, SALES_ORDER_STATUSES } from "@/lib/ops/labels";

/**
 * クリエイターの売上ダッシュボードが読むもの。
 * 金額は creator_item_settlementsから。注文の精算を明細に配ったもので、
 * 発送済みなら実費で確定、それまでは見込み。
 */
export async function getCreatorDashboard(month: string) {
  const { db, user } = await requireCreator();

  const [
    { data: items },
    { data: balance },
    { data: account },
    { count: followers },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("creator_item_settlements")
        .selectAll("creator_item_settlements")
        .where("creator_item_settlements.creator_id", "=", user.id)
        .where(
          sql<boolean>`${sql.ref("creator_item_settlements.status")} = any(${[...SALES_ORDER_STATUSES]})`,
        )
        .orderBy("creator_item_settlements.ordered_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("creator_payout_balances")
        .selectAll("creator_payout_balances")
        .where("creator_payout_balances.creator_id", "=", user.id)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("payout_accounts")
        .select([
          "payout_accounts.bank_name",
          "payout_accounts.branch_name",
          "payout_accounts.account_type",
          "payout_accounts.account_number",
        ])
        .where("payout_accounts.creator_id", "=", user.id)
        .executeTakeFirst(),
    ),
    countResult(
      db
        .selectFrom("creator_follows")
        .where("creator_follows.creator_id", "=", user.id)
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
    ),
  ]);

  const rows = items ?? [];
  const [y, m] = month.split("-").map(Number);
  const inMonth = (iso: string | null, key: string) =>
    !!iso && monthKey(new Date(iso)) === key;
  const prevKey = monthKey(new Date(y, m - 2, 1));

  const thisMonth = rows.filter((r) => inMonth(r.ordered_at, month));
  const prevMonth = rows.filter((r) => inMonth(r.ordered_at, prevKey));
  const sum = <T>(list: T[], pick: (r: T) => number | null) =>
    list.reduce((n, r) => n + (pick(r) ?? 0), 0);

  const goods = sum(thisMonth, (r) => r.goods_amount);
  const prevGoods = sum(prevMonth, (r) => r.goods_amount);
  const units = sum(thisMonth, (r) => r.quantity);
  const prevUnits = sum(prevMonth, (r) => r.quantity);

  // 直近8か月の売上（作品代金）
  const trend: { key: string; goods: number; payout: number }[] = [];
  for (let k = 7; k >= 0; k--) {
    const d = new Date(y, m - 1 - k, 1);
    const key = monthKey(d);
    const list = rows.filter((r) => inMonth(r.ordered_at, key));
    trend.push({
      key,
      goods: sum(list, (r) => r.goods_amount),
      payout: sum(list, (r) => r.payout_amount),
    });
  }

  return {
    month,
    goods,
    goodsChangePct:
      prevGoods > 0
        ? Math.round(((goods - prevGoods) / prevGoods) * 100)
        : null,
    units,
    unitsChange: units - prevUnits,
    monthPayout: sum(thisMonth, (r) => r.payout_amount),
    followers: followers ?? 0,
    trend,
    recent: rows.slice(0, 8),
    balance,
    account,
  };
}

/** 払込ページ: 残高・口座・申請履歴。 */
export async function getPayoutContext() {
  const { db, user } = await requireCreator();
  const [
    { data: balance },
    { data: account },
    { data: requests },
    { data: charges },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("creator_payout_balances")
        .selectAll("creator_payout_balances")
        .where("creator_payout_balances.creator_id", "=", user.id)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("payout_accounts")
        .selectAll("payout_accounts")
        .where("payout_accounts.creator_id", "=", user.id)
        .executeTakeFirst(),
    ),
    queryResult(
      db
        .selectFrom("payout_requests")
        .selectAll("payout_requests")
        .where("payout_requests.creator_id", "=", user.id)
        .orderBy("payout_requests.requested_at", "desc")
        .execute(),
    ),
    queryResult(
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
    ),
  ]);
  return { balance, account, requests: requests ?? [], charges: charges ?? [] };
}

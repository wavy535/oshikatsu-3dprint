import "server-only";

import { requireCreator } from "@/lib/auth/guards";
import { monthKey, SALES_ORDER_STATUSES } from "@/lib/ops/labels";

/**
 * クリエイターの売上ダッシュボードが読むもの。
 * 金額は creator_item_settlements（0019）から。注文の精算を明細に配ったもので、
 * 発送済みなら実費で確定、それまでは見込み。
 */
export async function getCreatorDashboard(month: string) {
  const { supabase, user } = await requireCreator();

  const [{ data: items }, { data: balance }, { data: account }, { count: followers }] =
    await Promise.all([
      supabase
        .from("creator_item_settlements")
        .select("*")
        .eq("creator_id", user.id)
        .in("status", [...SALES_ORDER_STATUSES])
        .order("ordered_at", { ascending: false }),
      supabase.from("creator_payout_balances").select("*").eq("creator_id", user.id).maybeSingle(),
      supabase.from("payout_accounts").select("bank_name, branch_name, account_type, account_number").eq("creator_id", user.id).maybeSingle(),
      supabase.from("creator_follows").select("follower_id", { count: "exact", head: true }).eq("creator_id", user.id),
    ]);

  const rows = items ?? [];
  const [y, m] = month.split("-").map(Number);
  const inMonth = (iso: string | null, key: string) => !!iso && monthKey(new Date(iso)) === key;
  const prevKey = monthKey(new Date(y, m - 2, 1));

  const thisMonth = rows.filter((r) => inMonth(r.ordered_at, month));
  const prevMonth = rows.filter((r) => inMonth(r.ordered_at, prevKey));
  const sum = <T,>(list: T[], pick: (r: T) => number | null) => list.reduce((n, r) => n + (pick(r) ?? 0), 0);

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
    trend.push({ key, goods: sum(list, (r) => r.goods_amount), payout: sum(list, (r) => r.payout_amount) });
  }

  return {
    month,
    goods,
    goodsChangePct: prevGoods > 0 ? Math.round(((goods - prevGoods) / prevGoods) * 100) : null,
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
  const { supabase, user } = await requireCreator();
  const [{ data: balance }, { data: account }, { data: requests }, { data: charges }] = await Promise.all([
    supabase.from("creator_payout_balances").select("*").eq("creator_id", user.id).maybeSingle(),
    supabase.from("payout_accounts").select("*").eq("creator_id", user.id).maybeSingle(),
    supabase.from("payout_requests").select("*").eq("creator_id", user.id).order("requested_at", { ascending: false }),
    supabase
      .from("revision_requests")
      .select("id, revision_no, reprint_fee_jpy, created_at, works(title)")
      .eq("creator_id", user.id)
      .eq("charged_to_creator", true)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }),
  ]);
  return { balance, account, requests: requests ?? [], charges: charges ?? [] };
}

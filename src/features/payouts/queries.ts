import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type PayoutStatus = Database["public"]["Enums"]["payout_status"];

export async function getMySalesSummary(creatorId: string) {
  const supabase = await createClient();

  // 確定済み・支払待ち(まだ payout に収載されていない completed 明細 = 繰越中含む)
  // creator_order_items は購入者住所を含まないクリエイター向けビュー（RLS: 自分の明細のみ）
  const { data: completed, error: completedError } = await supabase
    .from("creator_order_items")
    .select("id, creator_revenue")
    .neq("item_status", "cancelled")
    .eq("order_status", "completed");
  if (completedError) throw completedError;

  const completedIds = (completed ?? []).flatMap((r) => (r.id ? [r.id] : []));
  let linkedIds = new Set<string>();
  if (completedIds.length > 0) {
    const { data: linked, error: linkedError } = await supabase
      .from("payout_items")
      .select("order_item_id")
      .in("order_item_id", completedIds);
    if (linkedError) throw linkedError;
    linkedIds = new Set((linked ?? []).map((r) => r.order_item_id));
  }
  const pendingConfirmed = (completed ?? [])
    .filter((r) => r.id && !linkedIds.has(r.id))
    .reduce((sum, r) => sum + (r.creator_revenue ?? 0), 0);

  // 未確定(まだ受取確認前 = paid/printing/shipped)の見込み額
  const { data: inProgress, error: inProgressError } = await supabase
    .from("creator_order_items")
    .select("creator_revenue")
    .neq("item_status", "cancelled")
    .in("order_status", ["paid", "printing", "shipped"]);
  if (inProgressError) throw inProgressError;
  const unconfirmed = (inProgress ?? []).reduce((sum, r) => sum + (r.creator_revenue ?? 0), 0);

  // 支払済み累計
  const { data: paidPayouts, error: paidError } = await supabase
    .from("payouts")
    .select("net_amount")
    .eq("creator_id", creatorId)
    .eq("status", "paid");
  if (paidError) throw paidError;
  const totalPaid = (paidPayouts ?? []).reduce((sum, r) => sum + r.net_amount, 0);

  return { pendingConfirmed, unconfirmed, totalPaid };
}

export async function listMyPayouts(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("id, period_start, period_end, gross_amount, commission, transfer_fee, net_amount, status, scheduled_date, paid_at, transaction_ref")
    .eq("creator_id", creatorId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyPayoutAccountStatus(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payout_accounts")
    .select("bank_name, bank_code, branch_name, branch_code, account_type, account_holder_kana, updated_at")
    .eq("user_id", creatorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function adminListPayouts(filters: { status?: PayoutStatus } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("payouts")
    .select("id, creator_id, period_start, period_end, net_amount, status, scheduled_date, paid_at, profiles!payouts_creator_id_fkey(handle, display_name)")
    .order("period_start", { ascending: false });
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function adminGetPayout(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      `*,
       profiles!payouts_creator_id_fkey(handle, display_name),
       payout_items(id, amount, order_items(id, product_title, order_id))`
    )
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

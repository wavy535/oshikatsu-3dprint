import "server-only";

import { requireCreator, requireUser } from "@/lib/auth/guards";

const QUOTE_SELECT = `id, quote_no, status, spec, price_jpy, print_fee_jpy, shipping_fee_jpy, lead_time_days,
  est_filament_grams, est_print_hours, part_count, note, expires_at, variant_id, accepted_at, ordered_at, created_at`;

/** 買う人：自分の相談一覧。 */
export async function listMyCustomRequests() {
  const { supabase, user } = await requireUser("/mypage/custom-orders");
  const { data } = await supabase
    .from("custom_order_requests")
    .select(
      `id, status, message, created_at,
       profiles!custom_order_requests_creator_id_fkey(id, display_name, avatar_url),
       works(id, title),
       custom_order_quotes(id, quote_no, status, price_jpy, print_fee_jpy, shipping_fee_jpy, expires_at, created_at)`
    )
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** 買う人：相談の詳細（見積りつき）。 */
export async function getMyCustomRequest(id: string) {
  const { supabase, user } = await requireUser("/mypage/custom-orders");
  const { data } = await supabase
    .from("custom_order_requests")
    .select(
      `id, status, message, created_at, creator_id,
       profiles!custom_order_requests_creator_id_fkey(id, display_name, avatar_url),
       works(id, title),
       custom_order_quotes(${QUOTE_SELECT})`
    )
    .eq("id", id)
    .eq("requester_id", user.id)
    .maybeSingle();
  if (!data) return null;
  data.custom_order_quotes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return data;
}

/** 相談フォームの相手と参考作品。 */
export async function getCustomRequestTarget(creatorId: string, workId?: string) {
  const { supabase } = await requireUser("/mypage/custom-orders/new");
  const [{ data: creator }, { data: work }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, bio").eq("id", creatorId).eq("role", "creator").maybeSingle(),
    workId
      ? supabase
          .from("works")
          .select("id, title, accepts_color_change, accepts_mirror, accepts_stand_hole, accepts_custom_size, accepts_other_request")
          .eq("id", workId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { creator, work };
}

/** クリエイター：届いた相談。 */
export async function listCreatorCustomRequests() {
  const { supabase, user } = await requireCreator();
  const { data } = await supabase
    .from("custom_order_requests")
    .select(
      `id, status, message, created_at,
       profiles!custom_order_requests_requester_id_fkey(id, display_name, avatar_url),
       works(id, title),
       custom_order_quotes(id, quote_no, status, price_jpy, expires_at)`
    )
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const rank = (s: string) => (s === "pending" ? 0 : s === "responded" ? 1 : 2);
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || b.created_at.localeCompare(a.created_at));
}

/** クリエイター：相談の詳細。見積りを書くための料金表も一緒に返す。 */
export async function getCreatorCustomRequest(id: string) {
  const { supabase, user } = await requireCreator();
  const [{ data }, { data: rule }] = await Promise.all([
    supabase
      .from("custom_order_requests")
      .select(
        `id, status, message, created_at, requester_id,
         profiles!custom_order_requests_requester_id_fkey(id, display_name, avatar_url),
         works(id, title),
         custom_order_quotes(${QUOTE_SELECT})`
      )
      .eq("id", id)
      .eq("creator_id", user.id)
      .maybeSingle(),
    supabase
      .from("print_pricing_rules")
      .select("material_yen_per_gram, machine_yen_per_hour, handling_per_part_yen, shipping_fee_jpy, platform_fee_rate")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (!data) return null;
  data.custom_order_quotes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { request: data, rule };
}

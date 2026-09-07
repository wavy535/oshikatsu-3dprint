import "server-only";

import { requireUser } from "@/lib/auth/guards";

export type Thread = {
  counterpartId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

/**
 * スレッド一覧。相手（自分以外の参加者）ごとに束ねて、最新の1件と未読数を出す。
 * 件数は運営規模なら数百件なので、取ってからまとめる。
 */
export async function listThreads() {
  const { supabase, user } = await requireUser("/mypage/messages");
  const { data: rows } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, read_at, created_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(500);

  const byCounterpart = new Map<string, Thread>();
  for (const m of rows ?? []) {
    const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
    const t = byCounterpart.get(other) ?? {
      counterpartId: other,
      name: "",
      avatarUrl: null,
      role: "",
      lastBody: m.body,
      lastAt: m.created_at,
      unread: 0,
    };
    if (m.recipient_id === user.id && !m.read_at) t.unread += 1;
    byCounterpart.set(other, t);
  }

  const ids = [...byCounterpart.keys()];
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, role")
      .in("id", ids);
    for (const p of profiles ?? []) {
      const t = byCounterpart.get(p.id);
      if (t) {
        t.name = p.display_name;
        t.avatarUrl = p.avatar_url;
        t.role = p.role;
      }
    }
  }
  return [...byCounterpart.values()];
}

/**
 * 相手とのやりとり。開いたときに自分あての未読を既読にする
 * （表示と同時に行う副作用だが、「開いた＝読んだ」の意味なのでここでやる）。
 */
export async function getThread(counterpartId: string) {
  const { supabase, user } = await requireUser("/mypage/messages");

  const [{ data: counterpart }, { data: messages }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, role, bio").eq("id", counterpartId).maybeSingle(),
    supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, read_at, created_at, order_id")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${counterpartId}),and(sender_id.eq.${counterpartId},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (!counterpart) return null;

  const unreadIds = (messages ?? []).filter((m) => m.recipient_id === user.id && !m.read_at).map((m) => m.id);
  if (unreadIds.length) {
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds).select("id");
  }

  // 取引に紐づくメッセージがあれば、その注文をチップで出す（自分が買った注文だけ読める）
  const orderIds = [...new Set((messages ?? []).map((m) => m.order_id).filter((v): v is string => !!v))];
  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("id, status, total_amount, order_items(works(title))")
        .in("id", orderIds)
    : { data: [] };

  return {
    me: user.id,
    counterpart,
    messages: messages ?? [],
    orders: new Map((orders ?? []).map((o) => [o.id, o])),
  };
}

/** `with=admin` を運営のユーザーIDに解く（運営が複数いれば最初の1人）。 */
export async function resolveCounterpart(param: string | undefined) {
  if (!param) return null;
  if (param !== "admin") return param;
  const { supabase } = await requireUser("/mypage/messages");
  const { data } = await supabase.from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

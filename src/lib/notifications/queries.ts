import "server-only";
import { requireUser } from "@/lib/auth/guards";
import type { NotificationKind } from "@/types/db";

export const KIND_LABEL: Record<NotificationKind, string> = {
  order_shipping: "注文・発送",
  favorite_price: "お気に入りの値下げ",
  message: "メッセージ",
  review: "レビュー",
  creator: "クリエイター",
  announcement: "お知らせ",
};

/** アプリ内で必ず受け取る種類（DBの check 制約と揃えている） */
export const MANDATORY_KINDS: NotificationKind[] = ["order_shipping", "creator"];

export async function listNotifications(kind?: NotificationKind) {
  const { supabase, user } = await requireUser("/mypage/notifications");
  let query = supabase
    .from("notifications")
    .select("id, kind, title, body, link_path, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  return data ?? [];
}

/** 通知設定。行が無い種類は「アプリ内・メールON／プッシュOFF」が既定。 */
export async function getNotificationPreferences() {
  const { supabase, user } = await requireUser("/mypage/notification-settings");
  const [prefsRes, settingsRes] = await Promise.all([
    supabase.from("notification_preferences").select("kind, in_app, email, push").eq("user_id", user.id),
    supabase.from("notification_settings").select("email_to, digest, digest_hour").eq("user_id", user.id).maybeSingle(),
  ]);

  const byKind = new Map((prefsRes.data ?? []).map((p) => [p.kind, p]));
  const kinds = (Object.keys(KIND_LABEL) as NotificationKind[]).map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    inApp: byKind.get(kind)?.in_app ?? true,
    email: byKind.get(kind)?.email ?? true,
    push: byKind.get(kind)?.push ?? false,
    locked: MANDATORY_KINDS.includes(kind),
  }));

  return { kinds, settings: settingsRes.data ?? null, email: user.email ?? "" };
}

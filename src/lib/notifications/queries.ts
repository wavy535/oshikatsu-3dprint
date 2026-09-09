import { queryResult } from "@/lib/db/result";
import "server-only";
import { requireUser } from "@/lib/auth/guards";
import type { NotificationKind } from "@/types/db";

import { KIND_LABEL, MANDATORY_KINDS } from "./labels";
export { KIND_LABEL, MANDATORY_KINDS } from "./labels";

export async function listNotifications(kind?: NotificationKind) {
  const { db, user } = await requireUser("/mypage/notifications");
  let query = db
    .selectFrom("notifications")
    .select([
      "notifications.id",
      "notifications.kind",
      "notifications.title",
      "notifications.body",
      "notifications.link_path",
      "notifications.read_at",
      "notifications.created_at",
    ])
    .where("notifications.user_id", "=", user.id)
    .orderBy("notifications.created_at", "desc")
    .limit(100);
  if (kind) query = query.where("notifications.kind", "=", kind);
  const { data } = await queryResult(query.execute());
  return data ?? [];
}

/** 通知設定。行が無い種類は「アプリ内・メールON／プッシュOFF」が既定。 */
export async function getNotificationPreferences() {
  const { db, user } = await requireUser("/mypage/notification-settings");
  const [prefsRes, settingsRes] = await Promise.all([
    queryResult(
      db
        .selectFrom("notification_preferences")
        .select([
          "notification_preferences.kind",
          "notification_preferences.in_app",
          "notification_preferences.email",
          "notification_preferences.push",
        ])
        .where("notification_preferences.user_id", "=", user.id)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("notification_settings")
        .select([
          "notification_settings.email_to",
          "notification_settings.digest",
          "notification_settings.digest_hour",
        ])
        .where("notification_settings.user_id", "=", user.id)
        .executeTakeFirst(),
    ),
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

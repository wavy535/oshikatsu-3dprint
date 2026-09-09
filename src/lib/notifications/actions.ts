"use server";
import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase, getOptionalUser } from "@/lib/auth/guards";
import { MANDATORY_KINDS } from "@/lib/notifications/labels";

export type NotificationActionState = { error: string | null; ok?: boolean };

/** 全部既読にする。件数の付け替えはDBの関数に任せる。 */
export async function markAllReadAction(): Promise<void> {
  const db = await getDatabase();
  await call(db, "mark_all_notifications_read", {});
  revalidatePath("/mypage/notifications");
}

const prefSchema = z.object({
  kind: z.enum([
    "order_shipping",
    "favorite_price",
    "message",
    "review",
    "creator",
    "announcement",
  ]),
  channel: z.enum(["in_app", "email", "push"]),
  value: z.enum(["on", "off"]),
});

/**
 * 通知の受け取り方を切り替える。
 * 取引に関わる種類のアプリ内通知はオフにできない（DBの check 制約と同じ判断を
 * UI 側でも持つ。制約に当たると保存できないことが分かりにくいため）。
 */
export async function toggleNotificationPreferenceAction(
  _prev: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = prefSchema.safeParse({
    kind: formData.get("kind"),
    channel: formData.get("channel"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: "設定を変更できませんでした" };

  const { kind, channel, value } = parsed.data;
  if (
    channel === "in_app" &&
    value === "off" &&
    MANDATORY_KINDS.includes(kind)
  ) {
    return { error: "この通知はアプリ内でオフにできません" };
  }

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  // Update only the selected channel so concurrent preference changes do not overwrite each other.
  const change = { [channel]: value === "on" };
  const { data, error } = await queryResult(
    db
      .insertInto("notification_preferences")
      .values({ user_id: user.id, kind, ...change })
      .onConflict((oc) => oc.columns(["user_id", "kind"]).doUpdateSet(change))
      .returning("kind")
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "設定を保存できませんでした" };
  revalidatePath("/mypage/notification-settings");
  return { error: null, ok: true };
}

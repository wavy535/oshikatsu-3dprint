"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { MANDATORY_KINDS } from "@/lib/notifications/queries";

export type NotificationActionState = { error: string | null; ok?: boolean };

/** 全部既読にする。件数の付け替えはDBの関数に任せる。 */
export async function markAllReadAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_all_notifications_read");
  revalidatePath("/mypage/notifications");
}

const prefSchema = z.object({
  kind: z.enum(["order_shipping", "favorite_price", "message", "review", "creator", "announcement"]),
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
  formData: FormData
): Promise<NotificationActionState> {
  const parsed = prefSchema.safeParse({
    kind: formData.get("kind"),
    channel: formData.get("channel"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: "設定を変更できませんでした" };

  const { kind, channel, value } = parsed.data;
  if (channel === "in_app" && value === "off" && MANDATORY_KINDS.includes(kind)) {
    return { error: "この通知はアプリ内でオフにできません" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: current } = await supabase
    .from("notification_preferences")
    .select("in_app, email, push")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();

  // 計算プロパティで組むと型が緩くなる（string index が入る）ので、
  // チャンネルごとに明示的に組み立てる
  const on = value === "on";
  const row = {
    user_id: user.id,
    kind,
    in_app: channel === "in_app" ? on : (current?.in_app ?? true),
    email: channel === "email" ? on : (current?.email ?? true),
    push: channel === "push" ? on : (current?.push ?? false),
  };

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(row, { onConflict: "user_id,kind" })
    .select("kind");

  if (error || !data || data.length === 0) return { error: "設定を保存できませんでした" };
  revalidatePath("/mypage/notification-settings");
  return { error: null, ok: true };
}

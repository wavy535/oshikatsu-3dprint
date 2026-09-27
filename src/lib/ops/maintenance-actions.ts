"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { serviceDatabase, atomicBatch } from "@/lib/db/client";
import { call } from "@/lib/db/functions";
import { dispatchNotificationEmails } from "@/lib/mail/dispatch";
import type { OpsActionState } from "./action-state";

/** Learning deployments do maintenance only when an administrator requests it. */
export async function runMaintenanceAction(): Promise<OpsActionState> {
  const { db: actorDb } = await requireAdmin();
  try {
    const db = serviceDatabase();
    const expired = await call(db, "expire_custom_quotes", {});
    if (expired.error) throw new Error(expired.error.message);
    const purged = await call(actorDb, "purge_old_notifications", {});
    if (purged.error) throw new Error(purged.error.message);
    await atomicBatch(db, [
      db.deleteFrom("auth_sessions").where("expires_at", "<", new Date().toISOString()),
      db.deleteFrom("auth_verifications").where("expires_at", "<", new Date().toISOString()),
      db.deleteFrom("auth_rate_limits").where("last_request", "<", Date.now() - 86_400_000),
    ]);
    const delivery = await dispatchNotificationEmails();
    return {
      error: delivery.errors.length
        ? `整理は完了しましたが、メール送信でエラーがありました（送信済み ${delivery.sent}通）。未送信分は再実行できます。`
        : null,
      message: `期限切れの見積り ${expired.data ?? 0}件、古い通知 ${purged.data ?? 0}件を整理し、通知メールを${delivery.sent}通送信しました。`,
    };
  } catch (error) {
    console.error("Manual maintenance failed", error);
    return { error: "処理を完了できませんでした。再実行できます。" };
  }
}

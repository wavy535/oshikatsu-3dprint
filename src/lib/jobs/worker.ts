import "server-only";
import { serviceDatabase } from "@/lib/db/client";
import { call } from "@/lib/db/functions";
import { getPool } from "@/lib/db/pool";
import { dispatchNotificationEmails } from "@/lib/mail/dispatch";

const state = globalThis as typeof globalThis & {
  backgroundJobsStarted?: boolean;
};

/** Persistent ECS tasks run this loop. Mail claims recover after five minutes;
 * expiry is idempotent. Multiple tasks can safely run the same sweep. */
export async function runBackgroundJobs() {
  const db = serviceDatabase();
  const expired = await call(db, "expire_custom_quotes", {});
  if (expired.error) throw new Error(expired.error.message);
  const purged = await call(db, "purge_old_notifications", {});
  if (purged.error) throw new Error(purged.error.message);
  const delivery = await dispatchNotificationEmails();
  if (delivery.errors.length)
    console.error("Notification delivery", delivery.errors);
  // Authentication state is owned by the runtime login, separate from business RLS.
  await getPool("auth").query(
    "delete from auth_sessions where expires_at < now(); delete from auth_verifications where expires_at < now(); delete from auth_rate_limits where last_request < extract(epoch from now() - interval '1 day') * 1000",
  );
}

export function startBackgroundJobs() {
  if (state.backgroundJobsStarted) return;
  state.backgroundJobsStarted = true;
  async function tick() {
    try {
      await runBackgroundJobs();
    } catch (error) {
      console.error(
        "Background jobs failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setTimeout(tick, 5 * 60_000).unref();
    }
  }
  // Let the HTTP server become ready first. Never overlap sweeps in one process.
  setTimeout(tick, 10_000).unref();
}

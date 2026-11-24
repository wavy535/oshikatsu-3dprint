import {
  DEMO_BROWSER_DAILY_LIMIT, DEMO_GLOBAL_DAILY_LIMIT, DEMO_COOLDOWN_MS,
  type DemoQuota,
} from "../demo-policy";

const DAY = 86_400_000;
const USAGE_SQL = `SELECT
  (SELECT count(*) FROM ai_demo_usage WHERE browser_id = ? AND created_at >= ?) AS browser_count,
  (SELECT count(*) FROM ai_demo_usage WHERE created_at >= ?) AS global_count`;
const RESERVE_SQL = `INSERT INTO ai_demo_usage(id, browser_id, created_at)
SELECT ?, ?, ?
WHERE (SELECT count(*) FROM ai_demo_usage WHERE created_at >= ?) < ?
AND (SELECT count(*) FROM ai_demo_usage WHERE browser_id = ? AND created_at >= ?) < ?
AND NOT EXISTS (SELECT 1 FROM ai_demo_usage WHERE browser_id = ? AND created_at > ?)`;
type Usage = { browser_count: number; global_count: number };

function quota(usage: Usage, day: number): DemoQuota {
  const globalRemaining = Math.max(0, DEMO_GLOBAL_DAILY_LIMIT - usage.global_count);
  return {
    remaining: Math.max(0, Math.min(DEMO_BROWSER_DAILY_LIMIT - usage.browser_count, globalRemaining)),
    globalRemaining,
    resetAt: day + DAY,
  };
}

export async function demoQuota(db: Pick<D1Database, "prepare" | "batch">, browserId: string, now = Date.now()) {
  const day = Math.floor(now / DAY) * DAY;
  const [result] = await db.batch<Usage>([db.prepare(USAGE_SQL).bind(browserId, day, day)]);
  return quota(result.results[0], day);
}

export async function reserveDemoChat(db: Pick<D1Database, "prepare" | "batch">, browserId: string, now = Date.now()) {
  const day = Math.floor(now / DAY) * DAY;
  // The conditional reservation and usage read share one atomic D1 batch.
  // Errors, cancellation and geometry repair requests still consume reservations.
  const results = await db.batch<Usage>([
    db.prepare("DELETE FROM ai_demo_usage WHERE created_at < ?").bind(now - 2 * DAY),
    db.prepare(RESERVE_SQL).bind(
      crypto.randomUUID(), browserId, now, day, DEMO_GLOBAL_DAILY_LIMIT,
      browserId, day, DEMO_BROWSER_DAILY_LIMIT, browserId, now - DEMO_COOLDOWN_MS,
    ),
    db.prepare(USAGE_SQL).bind(browserId, day, day),
  ]);
  return { allowed: results[1].meta.changes === 1, quota: quota(results[2].results[0], day) };
}

/** A single conditional INSERT serializes quota reservations in D1, across isolates. */
export const RESERVE_CHAT_SQL = `INSERT INTO ai_design_usage(id, user_id, created_at)
SELECT ?, ?, ?
WHERE (SELECT count(*) FROM ai_design_usage WHERE created_at >= ?) < 300
AND (SELECT count(*) FROM ai_design_usage WHERE user_id = ? AND created_at >= ?) < 30
AND NOT EXISTS (SELECT 1 FROM ai_design_usage WHERE user_id = ? AND created_at > ?)`;
export async function reserveChat(db: D1Database, userId: string, now = Date.now()): Promise<boolean> {
  // Reservations survive errors and cancellations; they still consume provider work.
  await db.prepare("DELETE FROM ai_design_usage WHERE created_at < ?").bind(now - 172_800_000).run();
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const result = await db.prepare(RESERVE_CHAT_SQL).bind(crypto.randomUUID(), userId, now, day, userId, day, userId, now - 8000).run();
  return result.meta.changes === 1;
}

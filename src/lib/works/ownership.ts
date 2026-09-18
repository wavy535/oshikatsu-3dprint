import "server-only";
import { getDatabase, getOptionalUser } from "@/lib/auth/guards";
import { queryResult } from "@/lib/db/result";

type OwnWork =
  | {
      ok: true;
      db: Awaited<ReturnType<typeof getDatabase>>;
      user: { id: string };
      work: { id: string; status: string };
    }
  | { ok: false; error: string };

/** その作品の持ち主か確かめる。すべてのSTEPの入口で通す。 */
export async function requireOwnWork(workId: string): Promise<OwnWork> {
  const { db, user } = await getOptionalUser();
  if (!user) return { ok: false, error: "ログインが必要です" };

  const { data: work } = await queryResult(
    db
      .selectFrom("works")
      .select(["works.id", "works.creator_id", "works.status"])
      .where("works.id", "=", workId)
      .executeTakeFirst(),
  );

  if (!work || work.creator_id !== user.id) {
    return { ok: false, error: "この作品を編集する権限がありません" };
  }
  return { ok: true, db, user, work };
}


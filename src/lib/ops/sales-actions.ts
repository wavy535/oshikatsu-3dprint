"use server";

import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import type { OpsActionState } from "./action-state";

// =============================================================================
// 払込管理
// =============================================================================

const payoutNextSchema = z.enum(["processing", "paid", "rejected"]);

/** 振込申請を進める。振込済み・却下のときは処理日時を入れる。通知はトリガーが出す。 */
export async function processPayoutAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const id = String(formData.get("id") ?? "");
  const parsed = payoutNextSchema.safeParse(formData.get("next"));
  if (!id || !parsed.success) return { error: "操作が不正です" };
  const next = parsed.data;

  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("payout_requests")
      .set({
        status: next,
        processed_at: next === "processing" ? null : new Date().toISOString(),
      })
      .where("payout_requests.id", "=", id)
      .where(
        sql<boolean>`${sql.ref("payout_requests.status")} = any(${["requested", "processing"]})`,
      )
      .returning(["id"])
      .execute(),
  );
  if (error) return { error: `更新に失敗しました（${error.message}）` };
  if (!data || data.length === 0) return { error: "この申請は更新できません" };

  revalidatePath("/admin/payouts");
  revalidatePath("/studio/payouts");
  return { error: null };
}

import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import "server-only";

import { getDatabase } from "@/lib/auth/guards";

/** 作品の Q&A（公開）。回答済みを先に、新しい順。 */
export async function listWorkQna(workId: string) {
  const db = await getDatabase();
  const [{ data: threads }, { data: rule }] = await Promise.all([
    queryResult(
      db
        .selectFrom("qna_threads")
        .select((eb) => [
          "qna_threads.id",
          "qna_threads.question",
          "qna_threads.answer",
          "qna_threads.answered_at",
          "qna_threads.created_at",
          "qna_threads.asker_id",
          jsonObjectFrom(
            eb
              .selectFrom("profiles as r0")
              .select(["r0.display_name"])
              .whereRef("r0.id", "=", "qna_threads.asker_id"),
          ).as("profiles"),
        ])
        .where("qna_threads.work_id", "=", workId)
        .orderBy("qna_threads.created_at", "desc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_pricing_rules")
        .select(["print_pricing_rules.shipping_fee_jpy"])
        .where("print_pricing_rules.is_active", "=", true)
        .executeTakeFirst(),
    ),
  ]);
  return {
    threads: threads ?? [],
    shippingFee: rule?.shipping_fee_jpy ?? null,
  };
}

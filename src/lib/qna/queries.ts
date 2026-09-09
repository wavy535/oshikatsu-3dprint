import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult, readPage } from "@/lib/db/result";
import "server-only";

import { getDatabase } from "@/lib/auth/guards";

/** 作品の Q&A（公開）。新しい順。 */
export async function listWorkQna(workId: string, requestedPage?: unknown) {
  const db = await getDatabase();
  const [page, { data: rule }] = await Promise.all([
    readPage(
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
        .orderBy("qna_threads.id", "desc"),
      requestedPage,
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
    ...page,
    threads: page.items,
    shippingFee: rule?.shipping_fee_jpy ?? null,
  };
}

import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";

// =============================================================================
// フィラメント在庫
// =============================================================================

/**
 * 在庫一覧。数字は3つの出どころから組む:
 *   在庫       … filaments.stock_grams（台帳の結果。トリガーが更新）
 *   予定消費   … 作業中ジョブの推定グラム（代表スロットの素材・色で束ねる）
 *   30日の消費 … filament_ledger の reason='print'
 */
export async function listFilamentStock() {
  const { db } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [
    { data: filaments },
    { data: openJobs },
    { data: recent },
    { data: slots },
  ] = await Promise.all([
    queryResult(
      db
        .selectFrom("filaments")
        .select([
          "filaments.id",
          "filaments.material",
          "filaments.color_name",
          "filaments.color_hex",
          "filaments.stock_grams",
          "filaments.price_per_gram",
          "filaments.is_active",
        ])
        .orderBy("filaments.material", "asc")
        .orderBy("filaments.color_name", "asc")
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("print_queue")
        .select([
          "print_queue.material",
          "print_queue.color_name",
          "print_queue.est_filament_grams",
        ])
        .where(
          sql<boolean>`${sql.ref("print_queue.status")} = any(${["queued", "printing", "reprinting", "qc_failed"]})`,
        )
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("filament_ledger")
        .select([
          "filament_ledger.filament_id",
          "filament_ledger.delta_grams",
          "filament_ledger.reason",
        ])
        .where("filament_ledger.created_at", ">=", since)
        .execute(),
    ),
    queryResult(
      db
        .selectFrom("work_color_slots")
        .select(["work_color_slots.filament_id"])
        .execute(),
    ),
  ]);

  const planned = new Map<string, number>();
  for (const j of openJobs ?? []) {
    const key = `${j.material}/${j.color_name}`;
    planned.set(
      key,
      (planned.get(key) ?? 0) + Number(j.est_filament_grams ?? 0),
    );
  }
  const used30 = new Map<string, number>();
  for (const l of recent ?? []) {
    if (l.reason !== "print") continue;
    used30.set(
      l.filament_id,
      (used30.get(l.filament_id) ?? 0) - Number(l.delta_grams),
    );
  }
  const workCount = new Map<string, number>();
  for (const s of slots ?? []) {
    if (s.filament_id)
      workCount.set(s.filament_id, (workCount.get(s.filament_id) ?? 0) + 1);
  }

  return (filaments ?? []).map((f) => ({
    ...f,
    plannedGrams: planned.get(`${f.material}/${f.color_name}`) ?? 0,
    used30Grams: used30.get(f.id) ?? 0,
    workCount: workCount.get(f.id) ?? 0,
  }));
}

export type FilamentStockRow = Awaited<
  ReturnType<typeof listFilamentStock>
>[number];

/** 台帳の直近の動き。 */
export async function listFilamentLedger(limit = 30) {
  const { db } = await requireAdmin();
  const { data } = await queryResult(
    db
      .selectFrom("filament_ledger")
      .select((eb) => [
        "filament_ledger.id",
        "filament_ledger.delta_grams",
        "filament_ledger.reason",
        "filament_ledger.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("filaments as r25")
            .select(["r25.material", "r25.color_name", "r25.color_hex"])
            .whereRef("r25.id", "=", "filament_ledger.filament_id"),
        ).as("filaments"),
        jsonObjectFrom(
          eb
            .selectFrom("print_jobs as r26")
            .select(["r26.id", "r26.job_no"])
            .whereRef("r26.id", "=", "filament_ledger.print_job_id"),
        ).as("print_jobs"),
        jsonObjectFrom(
          eb
            .selectFrom("profiles as r27")
            .select(["r27.display_name"])
            .whereRef("r27.id", "=", "filament_ledger.actor_id"),
        ).as("profiles"),
      ])
      .orderBy("filament_ledger.created_at", "desc")
      .limit(limit)
      .execute(),
  );
  return data ?? [];
}

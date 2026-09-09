import { signedDownload } from "@/lib/files/s3";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult, countResult } from "@/lib/db/result";
import { sql } from "kysely";
import "server-only";

import { requireCreator } from "@/lib/auth/guards";

/** 自分の修正依頼。未対応・対応中を先に、期限の近い順。 */
export async function listMyRevisions() {
  const { db, user } = await requireCreator();
  const { data } = await queryResult(
    db
      .selectFrom("revision_requests")
      .select((eb) => [
        "revision_requests.id",
        "revision_requests.revision_no",
        "revision_requests.status",
        "revision_requests.cause",
        "revision_requests.message",
        "revision_requests.due_at",
        "revision_requests.reprint_fee_jpy",
        "revision_requests.charged_to_creator",
        "revision_requests.resolution",
        "revision_requests.resolved_at",
        "revision_requests.created_at",
        jsonObjectFrom(
          eb
            .selectFrom("works as r0")
            .select((eb) => [
              "r0.id",
              "r0.title",
              jsonArrayFrom(
                eb
                  .selectFrom("work_images as r1")
                  .select(["r1.storage_path", "r1.sort_order"])
                  .whereRef("r1.work_id", "=", "r0.id"),
              ).as("work_images"),
            ])
            .whereRef("r0.id", "=", "revision_requests.work_id"),
        ).as("works"),
        jsonObjectFrom(
          eb
            .selectFrom("work_variants as r2")
            .select(["r2.id", "r2.size_label", "r2.is_listed"])
            .whereRef("r2.id", "=", "revision_requests.variant_id"),
        ).as("work_variants"),
      ])
      .where("revision_requests.creator_id", "=", user.id)
      .orderBy("revision_requests.created_at", "desc")
      .execute(),
  );

  const rows = data ?? [];
  const rank = (s: string) =>
    s === "open" ? 0 : s === "in_progress" ? 1 : s === "disputed" ? 2 : 3;
  return rows.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) || a.due_at.localeCompare(b.due_at),
  );
}

export type RevisionRow = Awaited<ReturnType<typeof listMyRevisions>>[number];

/**
 * 修正依頼の詳細。検品の記録（検品担当・メモ・写真）、STEP1 の検証値（パーツごと）、
 * いま止まっているもの（出品停止・印刷待ちの注文）をまとめて返す。
 * 写真は非公開バケットなので署名付きURLにする（クリエイターは自分の作品ぶんだけ読める）。
 */
export async function getMyRevision(id: string) {
  const { db, user } = await requireCreator();

  const { data: rev } = await queryResult(
    db
      .selectFrom("revision_requests")
      .select((eb) => [
        "revision_requests.id",
        "revision_requests.revision_no",
        "revision_requests.status",
        "revision_requests.cause",
        "revision_requests.message",
        "revision_requests.photo_paths",
        "revision_requests.due_at",
        "revision_requests.reprint_fee_jpy",
        "revision_requests.charged_to_creator",
        "revision_requests.resolution",
        "revision_requests.resolution_note",
        "revision_requests.resolved_at",
        "revision_requests.created_at",
        "revision_requests.work_id",
        "revision_requests.variant_id",
        "revision_requests.object_id",
        "revision_requests.print_job_id",
        "revision_requests.inspection_id",
        jsonObjectFrom(
          eb
            .selectFrom("works as r3")
            .select(["r3.id", "r3.title"])
            .whereRef("r3.id", "=", "revision_requests.work_id"),
        ).as("works"),
        jsonObjectFrom(
          eb
            .selectFrom("work_variants as r4")
            .select(["r4.id", "r4.size_label", "r4.is_listed", "r4.stock"])
            .whereRef("r4.id", "=", "revision_requests.variant_id"),
        ).as("work_variants"),
      ])
      .where("revision_requests.id", "=", id)
      .where("revision_requests.creator_id", "=", user.id)
      .executeTakeFirst(),
  );
  if (!rev) return null;

  const [
    { data: inspection },
    { data: job },
    { data: objects },
    pendingJobs,
    photos,
  ] = await Promise.all([
    rev.inspection_id
      ? queryResult(
          db
            .selectFrom("qc_inspections")
            .select((eb) => [
              "qc_inspections.created_at",
              "qc_inspections.memo",
              jsonObjectFrom(
                eb
                  .selectFrom("profiles as r5")
                  .select(["r5.display_name"])
                  .whereRef("r5.id", "=", "qc_inspections.inspector_id"),
              ).as("profiles"),
              jsonArrayFrom(
                eb
                  .selectFrom("qc_check_results as r6")
                  .select((eb) => [
                    "r6.code",
                    "r6.passed",
                    "r6.note",
                    jsonObjectFrom(
                      eb
                        .selectFrom("qc_check_definitions as r7")
                        .select(["r7.label"])
                        .whereRef("r7.code", "=", "r6.code"),
                    ).as("qc_check_definitions"),
                  ])
                  .whereRef("r6.inspection_id", "=", "qc_inspections.id"),
              ).as("qc_check_results"),
            ])
            .where("qc_inspections.id", "=", rev.inspection_id)
            .executeTakeFirst(),
        )
      : Promise.resolve({ data: null }),
    rev.print_job_id
      ? queryResult(
          db
            .selectFrom("print_jobs")
            .select([
              "print_jobs.job_no",
              "print_jobs.failure_count",
              "print_jobs.order_id",
              "print_jobs.status",
            ])
            .where("print_jobs.id", "=", rev.print_job_id)
            .executeTakeFirst(),
        )
      : Promise.resolve({ data: null }),
    queryResult(
      db
        .selectFrom("work_asset_objects")
        .select((eb) => [
          "work_asset_objects.id",
          "work_asset_objects.name",
          "work_asset_objects.object_index",
          "work_asset_objects.bbox_x_mm",
          "work_asset_objects.bbox_y_mm",
          "work_asset_objects.bbox_z_mm",
          "work_asset_objects.min_wall_thickness_mm",
          "work_asset_objects.self_intersection_count",
          "work_asset_objects.is_manifold",
          jsonObjectFrom(
            eb
              .selectFrom("work_assets as r8")
              .select(["r8.work_id"])
              .where("r8.work_id", "=", rev.work_id)
              .whereRef("r8.id", "=", "work_asset_objects.asset_id"),
          )
            .$notNull()
            .as("work_assets"),
        ])
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("work_assets as r8")
              .select(["r8.work_id"])
              .where("r8.work_id", "=", rev.work_id)
              .whereRef("r8.id", "=", "work_asset_objects.asset_id")
              .clearSelect()
              .select("r8.id"),
          ),
        )
        .orderBy("work_asset_objects.object_index", "asc")
        .execute(),
    ),
    rev.variant_id
      ? countResult(
          db
            .selectFrom("print_jobs")
            .where("print_jobs.variant_id", "=", rev.variant_id)
            .where(
              sql<boolean>`${sql.ref("print_jobs.status")} = any(${["queued", "printing", "printed", "qc_failed", "reprinting"]})`,
            )
            .select((eb) => eb.fn.countAll<number>().as("count"))
            .executeTakeFirstOrThrow(),
        )
      : Promise.resolve({ count: 0 }),
    Promise.all(
      rev.photo_paths.map(async (path) => {
        return {
          path,
          url: path.startsWith(`${rev.work_id}/`)
            ? await signedDownload("qc-photos", path)
            : null,
        };
      }),
    ),
  ]);

  return {
    revision: rev,
    inspection,
    job,
    objects: objects ?? [],
    pendingJobCount: pendingJobs.count ?? 0,
    photos,
  };
}

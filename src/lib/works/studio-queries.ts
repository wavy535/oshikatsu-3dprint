import { jsonArrayFrom } from "kysely/helpers/postgres";
import { readPage, queryResult } from "@/lib/db/result";
import "server-only";
import { requireCreator } from "@/lib/auth/guards";

/** 作品管理の一覧。下書きも含む。 */
export async function listMyWorks(requestedPage?: unknown) {
  const { db, user } = await requireCreator();
  return readPage(
    db
      .selectFrom("works")
      .select((eb) => [
        "works.id",
        "works.title",
        "works.status",
        "works.created_at",
        "works.favorite_count",
        "works.min_price_jpy",
        jsonArrayFrom(
          eb
            .selectFrom("work_images as r0")
            .select(["r0.storage_path", "r0.sort_order"])
            .whereRef("r0.work_id", "=", "works.id")
            .orderBy("r0.sort_order", "asc")
            .orderBy("r0.id", "asc")
            .limit(1),
        ).as("work_images"),
        jsonArrayFrom(
          eb
            .selectFrom("work_variants as r1")
            .select([
              "r1.id",
              "r1.size_label",
              "r1.is_listed",
              "r1.stock",
              "r1.price_jpy",
            ])
            .whereRef("r1.work_id", "=", "works.id"),
        ).as("work_variants"),
        jsonArrayFrom(
          eb
            .selectFrom("work_assets as r2")
            .select(["r2.id", "r2.validation_status"])
            .whereRef("r2.work_id", "=", "works.id"),
        ).as("work_assets"),
      ])
      .where("works.creator_id", "=", user.id)
      .orderBy("works.created_at", "desc")
      .orderBy("works.id", "desc"),
    requestedPage,
  );
}

/**
 * 投稿4STEPで使う下書き一式。
 * 解析由来のもの（パーツ・検証結果・色スロット）と、クリエイターが決めるもの
 * （印刷指示・価格・在庫・画像）をまとめて1回で引く。
 */
export async function getWorkDraft(id: string) {
  const { db, user } = await requireCreator();
  const { data } = await queryResult(
    db
      .selectFrom("works")
      .select((eb) => [
        "works.id",
        "works.title",
        "works.description",
        "works.status",
        "works.creator_id",
        "works.created_at",
        "works.accepts_color_change",
        "works.accepts_mirror",
        "works.accepts_stand_hole",
        "works.accepts_custom_size",
        "works.accepts_other_request",
        jsonArrayFrom(
          eb
            .selectFrom("work_assets as r3")
            .select((eb) => [
              "r3.id",
              "r3.file_name",
              "r3.file_format",
              "r3.file_size_bytes",
              "r3.object_count",
              "r3.triangle_count",
              "r3.total_volume_cm3",
              "r3.bbox_x_mm",
              "r3.bbox_y_mm",
              "r3.bbox_z_mm",
              "r3.validation_status",
              "r3.validated_at",
              "r3.is_primary",
              "r3.storage_path",
              jsonArrayFrom(
                eb
                  .selectFrom("work_asset_objects as r4")
                  .select([
                    "r4.id",
                    "r4.object_index",
                    "r4.name",
                    "r4.triangle_count",
                    "r4.bbox_x_mm",
                    "r4.bbox_y_mm",
                    "r4.bbox_z_mm",
                    "r4.is_manifold",
                    "r4.min_wall_thickness_mm",
                  ])
                  .whereRef("r4.asset_id", "=", "r3.id"),
              ).as("work_asset_objects"),
              jsonArrayFrom(
                eb
                  .selectFrom("work_validation_issues as r5")
                  .select([
                    "r5.id",
                    "r5.code",
                    "r5.severity",
                    "r5.message",
                    "r5.detail",
                  ])
                  .whereRef("r5.asset_id", "=", "r3.id"),
              ).as("work_validation_issues"),
            ])
            .whereRef("r3.work_id", "=", "works.id"),
        ).as("work_assets"),
        jsonArrayFrom(
          eb
            .selectFrom("work_color_slots as r6")
            .select([
              "r6.id",
              "r6.slot_index",
              "r6.source_name",
              "r6.source_hex",
              "r6.face_count",
              "r6.filament_id",
            ])
            .whereRef("r6.work_id", "=", "works.id"),
        ).as("work_color_slots"),
        jsonArrayFrom(
          eb
            .selectFrom("work_part_instructions as r7")
            .select([
              "r7.id",
              "r7.object_id",
              "r7.variant_id",
              "r7.orientation",
              "r7.no_rotate",
              "r7.support",
              "r7.support_note",
              "r7.note",
            ])
            .whereRef("r7.work_id", "=", "works.id"),
        ).as("work_part_instructions"),
        jsonArrayFrom(
          eb
            .selectFrom("work_variants as r8")
            .select([
              "r8.id",
              "r8.size_label",
              "r8.nui_size_cm",
              "r8.scale_ratio",
              "r8.is_base",
              "r8.price_jpy",
              "r8.stock",
              "r8.is_listed",
              "r8.is_printable",
              "r8.unprintable_reason",
              "r8.print_fee_jpy",
              "r8.est_filament_grams",
              "r8.est_print_hours",
              "r8.part_count",
              "r8.batch_count",
              "r8.bbox_x_mm",
              "r8.bbox_y_mm",
              "r8.bbox_z_mm",
              "r8.fit_width_mm",
              "r8.fit_height_mm",
              "r8.fit_depth_mm",
            ])
            .whereRef("r8.work_id", "=", "works.id"),
        ).as("work_variants"),
        jsonArrayFrom(
          eb
            .selectFrom("work_tags as r9")
            .select(["r9.tag_id"])
            .whereRef("r9.work_id", "=", "works.id"),
        ).as("work_tags"),
        jsonArrayFrom(
          eb
            .selectFrom("work_images as r10")
            .select(["r10.id", "r10.storage_path", "r10.sort_order"])
            .whereRef("r10.work_id", "=", "works.id"),
        ).as("work_images"),
      ])
      .where("works.id", "=", id)
      .where("works.creator_id", "=", user.id)
      .executeTakeFirst(),
  );

  return data;
}

export async function listFilaments() {
  const { db } = await requireCreator();
  const { data } = await queryResult(
    db
      .selectFrom("filaments")
      .select([
        "filaments.id",
        "filaments.material",
        "filaments.color_name",
        "filaments.color_hex",
        "filaments.stock_grams",
        "filaments.is_active",
      ])
      .where("filaments.is_active", "=", true)
      .orderBy("filaments.material", "asc")
      .execute(),
  );
  return data ?? [];
}

export async function listTags() {
  const { db } = await requireCreator();
  const { data } = await queryResult(
    db
      .selectFrom("tags")
      .select([
        "tags.id",
        "tags.type",
        "tags.name",
        "tags.slug",
        "tags.sort_order",
      ])
      .orderBy("tags.sort_order", "asc")
      .execute(),
  );
  return data ?? [];
}

import { queryResult } from "@/lib/db/result";
import "server-only";
import { requireUser } from "@/lib/auth/guards";

/** 自分のマイぬい。メインを先頭に、あとは登録順。 */
export async function listMyNuis() {
  const { db, user } = await requireUser("/mypage/nuis");
  const { data } = await queryResult(
    db
      .selectFrom("nui_profiles")
      .select([
        "nui_profiles.id",
        "nui_profiles.name",
        "nui_profiles.kind",
        "nui_profiles.height_mm",
        "nui_profiles.sit_height_mm",
        "nui_profiles.shoulder_width_mm",
        "nui_profiles.hug_width_mm",
        "nui_profiles.nui_size_cm",
        "nui_profiles.is_main",
        "nui_profiles.created_at",
      ])
      .where("nui_profiles.user_id", "=", user.id)
      .orderBy("nui_profiles.is_main", "desc")
      .orderBy("nui_profiles.created_at", "asc")
      .execute(),
  );
  return data ?? [];
}

export async function getMyNui(id: string) {
  const { db, user } = await requireUser("/mypage/nuis");
  const { data } = await queryResult(
    db
      .selectFrom("nui_profiles")
      .selectAll("nui_profiles")
      .where("nui_profiles.id", "=", id)
      .where("nui_profiles.user_id", "=", user.id)
      .executeTakeFirst(),
  );
  return data;
}

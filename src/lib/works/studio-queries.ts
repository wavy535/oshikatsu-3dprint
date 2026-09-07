import "server-only";
import { requireCreator } from "@/lib/auth/guards";

/** 作品管理の一覧。下書きも含む。 */
export async function listMyWorks() {
  const { supabase, user } = await requireCreator();
  const { data } = await supabase
    .from("works")
    .select(
      `id, title, status, created_at, favorite_count, min_price_jpy,
       work_images(storage_path, sort_order),
       work_variants(id, size_label, is_listed, stock, price_jpy),
       work_assets(id, validation_status)`
    )
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * 投稿4STEPで使う下書き一式。
 * 解析由来のもの（パーツ・検証結果・色スロット）と、クリエイターが決めるもの
 * （印刷指示・価格・在庫・画像）をまとめて1回で引く。
 */
export async function getWorkDraft(id: string) {
  const { supabase, user } = await requireCreator();
  const { data } = await supabase
    .from("works")
    .select(
      `id, title, description, status, creator_id, created_at,
       accepts_color_change, accepts_mirror, accepts_stand_hole,
       accepts_custom_size, accepts_other_request,
       work_assets(id, file_name, file_format, file_size_bytes, object_count, triangle_count,
                   total_volume_cm3, bbox_x_mm, bbox_y_mm, bbox_z_mm,
                   validation_status, validated_at, is_primary, storage_path,
                   work_asset_objects(id, object_index, name, triangle_count,
                                      bbox_x_mm, bbox_y_mm, bbox_z_mm,
                                      is_manifold, min_wall_thickness_mm),
                   work_validation_issues(id, code, severity, message, detail)),
       work_color_slots(id, slot_index, source_name, source_hex, face_count, filament_id),
       work_part_instructions(id, object_id, variant_id, orientation, no_rotate, support, support_note, note),
       work_variants(id, size_label, nui_size_cm, scale_ratio, is_base, price_jpy, stock,
                     is_listed, is_printable, unprintable_reason, print_fee_jpy,
                     est_filament_grams, est_print_hours, part_count, batch_count,
                     bbox_x_mm, bbox_y_mm, bbox_z_mm,
                     fit_width_mm, fit_height_mm, fit_depth_mm),
       work_tags(tag_id),
       work_images(id, storage_path, sort_order)`
    )
    .eq("id", id)
    .eq("creator_id", user.id)
    .maybeSingle();

  return data;
}

export async function listFilaments() {
  const { supabase } = await requireCreator();
  const { data } = await supabase
    .from("filaments")
    .select("id, material, color_name, color_hex, stock_grams, is_active")
    .eq("is_active", true)
    .order("material", { ascending: true });
  return data ?? [];
}

export async function listTags() {
  const { supabase } = await requireCreator();
  const { data } = await supabase
    .from("tags")
    .select("id, type, name, slug, sort_order")
    .order("sort_order", { ascending: true });
  return data ?? [];
}

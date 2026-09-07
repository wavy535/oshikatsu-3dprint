import "server-only";

import { requireCreator } from "@/lib/auth/guards";

const LIST_SELECT = `id, revision_no, status, cause, message, due_at, reprint_fee_jpy, charged_to_creator,
  resolution, resolved_at, created_at,
  works(id, title, work_images(storage_path, sort_order)),
  work_variants(id, size_label, is_listed)`;

/** 自分の修正依頼。未対応・対応中を先に、期限の近い順。 */
export async function listMyRevisions() {
  const { supabase, user } = await requireCreator();
  const { data } = await supabase
    .from("revision_requests")
    .select(LIST_SELECT)
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const rank = (s: string) => (s === "open" ? 0 : s === "in_progress" ? 1 : s === "disputed" ? 2 : 3);
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || a.due_at.localeCompare(b.due_at));
}

export type RevisionRow = Awaited<ReturnType<typeof listMyRevisions>>[number];

/**
 * 修正依頼の詳細。検品の記録（検品担当・メモ・写真）、STEP1 の検証値（パーツごと）、
 * いま止まっているもの（出品停止・印刷待ちの注文）をまとめて返す。
 * 写真は非公開バケットなので署名付きURLにする（クリエイターは自分の作品ぶんだけ読める）。
 */
export async function getMyRevision(id: string) {
  const { supabase, user } = await requireCreator();

  const { data: rev } = await supabase
    .from("revision_requests")
    .select(
      `id, revision_no, status, cause, message, photo_paths, due_at, reprint_fee_jpy, charged_to_creator,
       resolution, resolution_note, resolved_at, created_at, work_id, variant_id, object_id, print_job_id,
       inspection_id,
       works(id, title),
       work_variants(id, size_label, is_listed, stock)`
    )
    .eq("id", id)
    .eq("creator_id", user.id)
    .maybeSingle();
  if (!rev) return null;

  const [{ data: inspection }, { data: job }, { data: objects }, pendingJobs, photos] =
    await Promise.all([
      rev.inspection_id
        ? supabase
            .from("qc_inspections")
            .select("created_at, memo, profiles!qc_inspections_inspector_id_fkey(display_name), qc_check_results(code, passed, note, qc_check_definitions(label))")
            .eq("id", rev.inspection_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      rev.print_job_id
        ? supabase
            .from("print_jobs")
            .select("job_no, failure_count, order_id, status")
            .eq("id", rev.print_job_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("work_asset_objects")
        .select(
          "id, name, object_index, bbox_x_mm, bbox_y_mm, bbox_z_mm, min_wall_thickness_mm, self_intersection_count, is_manifold, work_assets!inner(work_id)"
        )
        .eq("work_assets.work_id", rev.work_id)
        .order("object_index"),
      rev.variant_id
        ? supabase
            .from("print_jobs")
            .select("id", { count: "exact", head: true })
            .eq("variant_id", rev.variant_id)
            .in("status", ["queued", "printing", "printed", "qc_failed", "reprinting"])
        : Promise.resolve({ count: 0 }),
      Promise.all(
        rev.photo_paths.map(async (path) => {
          const { data } = await supabase.storage.from("qc-photos").createSignedUrl(path, 60 * 60);
          return { path, url: data?.signedUrl ?? null };
        })
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

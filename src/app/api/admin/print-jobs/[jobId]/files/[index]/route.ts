import { getUserProfile } from "@/lib/auth/guards";
import { signedDownload } from "@/lib/files/s3";
import { printFilesFromSnapshot } from "@/lib/ops/print-files";
import { idSchema } from "@/lib/validation";

/** Download the purchased revision, never the creator's latest replacement. */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string; index: string }> }) {
  const { db, profile } = await getUserProfile();
  const { jobId, index } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (profile?.role !== "admin" || !idSchema.safeParse(jobId).success || !/^\d{1,2}$/.test(index))
    return new Response(null, { status: 404, headers });
  const item = await db.selectFrom("print_jobs as j")
    .innerJoin("order_items as i", "i.id", "j.order_item_id")
    .select("i.print_assets_snapshot").where("j.id", "=", jobId).executeTakeFirst();
  const file = printFilesFromSnapshot(item?.print_assets_snapshot)[Number(index)];
  if (!file) return new Response(null, { status: 404, headers });
  return new Response(null, { status: 307, headers: { ...headers, Location: await signedDownload("work-stl", file.storage_path) } });
}

import "server-only";
import { serviceDatabase } from "@/lib/db/client";

export type ArWorkSource = { storagePath: string; fileName: string; scaleRatio: number };

/** Only the dedicated AR asset of a published work and listed size is publicly convertible. */
export async function getArWorkSource(workId: string, variantId: string): Promise<ArWorkSource | null> {
  const asset = await serviceDatabase()
    .selectFrom("work_variants as v")
    .innerJoin("works as w", "w.id", "v.work_id")
    .innerJoin("work_ar_assets as a", "a.work_id", "w.id")
    .select(["a.storage_path", "a.file_name", "v.scale_ratio"])
    .where("v.id", "=", variantId)
    .where("v.work_id", "=", workId)
    .where("v.is_listed", "=", true)
    .where("w.status", "=", "published")
    .executeTakeFirst();
  return asset ? { storagePath: asset.storage_path, fileName: asset.file_name, scaleRatio: Number(asset.scale_ratio) } : null;
}

import "server-only";
import { serviceDatabase } from "@/lib/db/client";
import { queryResult } from "@/lib/db/result";

export type ArWorkSource = { storagePath: string; fileName: string; scaleRatio: number };

/**
 * AR に変換する作品の3Dデータ。公開中の作品の、掲載中のサイズに限る。
 * Scene Viewer は未ログインで取りに来るので、公開状態をこの問い合わせで確かめてから service 権限で読む。
 * サイズに紐づくデータ（asset_id）があればそれを、なければ主データを使い、保存時と同じく scale_ratio をかける。
 */
export async function getArWorkSource(workId: string, variantId: string): Promise<ArWorkSource | null> {
  const db = serviceDatabase();
  const { data: variant, error } = await queryResult(
    db
      .selectFrom("work_variants as v")
      .innerJoin("works as w", "w.id", "v.work_id")
      .select(["v.asset_id", "v.scale_ratio"])
      .where("v.id", "=", variantId)
      .where("v.work_id", "=", workId)
      .where("v.is_listed", "=", true)
      .where("w.status", "=", "published")
      .executeTakeFirst(),
  );
  if (error) throw error;
  if (!variant) return null;

  const assets = db
    .selectFrom("work_assets")
    .select(["storage_path", "file_name"])
    .where("work_id", "=", workId);
  const { data: asset, error: assetError } = await queryResult(
    (variant.asset_id
      ? assets.where("id", "=", variant.asset_id)
      : assets.orderBy("is_primary", "desc").orderBy("created_at", "desc").orderBy("id", "desc")
    )
      .limit(1)
      .executeTakeFirst(),
  );
  if (assetError) throw assetError;
  if (!asset) return null;
  return {
    storagePath: asset.storage_path,
    fileName: asset.file_name,
    scaleRatio: Number(variant.scale_ratio),
  };
}

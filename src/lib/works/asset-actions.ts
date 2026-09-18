"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { idSchema } from "@/lib/validation";
import { MODEL_LIMITS } from "@/lib/print/limits";
import { requireOwnWork } from "./ownership";
import { appendAssets, replaceAsset } from "./asset-validation";
import { MAX_PRINT_FILES, MAX_PRINT_UPLOAD_BYTES } from "./asset-limits";
import type { StepActionState } from "./step-actions";

const schema = z.object({
  workId: idSchema,
  assetId: idSchema.optional(),
  files: z.array(z.object({
    storage_path: z.string().min(1),
    file_name: z.string().min(1).max(200).regex(/\.(stl|3mf)$/i),
    file_size_bytes: z.number().int().positive().max(MODEL_LIMITS.fileBytes),
  })).min(1).max(MAX_PRINT_FILES),
});

export async function registerPrintAssetsAction(_prev: StepActionState, data: FormData): Promise<StepActionState> {
  let input: unknown;
  try { input = JSON.parse(String(data.get("payload") ?? "")); }
  catch { return { error: "ファイル情報を読み取れませんでした" }; }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "印刷用ファイルの情報が不正です" };
  const { workId, assetId, files } = parsed.data;
  const owned = await requireOwnWork(workId);
  if (!owned.ok) return { error: owned.error };
  if (files.some((file) => !file.storage_path.startsWith(`${owned.user.id}/${workId}/`))) return { error: "アップロード先が不正です" };
  if (new Set(files.map((file) => file.storage_path)).size !== files.length) return { error: "ファイル情報が重複しています" };
  if (files.reduce((sum, file) => sum + file.file_size_bytes, 0) > MAX_PRINT_UPLOAD_BYTES) return { error: "合計80MiBまで選べます" };
  if (assetId && files.length !== 1) return { error: "差し替えは1ファイルずつ行ってください" };
  if (assetId) {
    const asset = await owned.db.selectFrom("work_assets").select("id").where("id", "=", assetId).where("work_id", "=", workId).executeTakeFirst();
    if (!asset) return { error: "この作品のファイルが見つかりません" };
  }
  const result = assetId ? await replaceAsset(workId, files[0], assetId) : await appendAssets(workId, files);
  if (!result.ok) return { error: result.error };
  for (const step of [1, 2, 3, 4]) revalidatePath(`/studio/works/${workId}/steps/${step}`);
  revalidatePath(`/works/${workId}`);
  return { error: null, ok: true };
}

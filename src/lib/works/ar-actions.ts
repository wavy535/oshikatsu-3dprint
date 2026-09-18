"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwnWork } from "./ownership";
import type { StepActionState } from "./step-actions";
import { idSchema } from "@/lib/validation";
import { readModel } from "@/lib/files/s3";
import { MODEL_LIMITS, AnalysisBudget } from "@/lib/print/limits";
import { buildWorkMeshes, readModelObjects, workModelExtension } from "@/lib/ar/work-model";

const schema = z.object({
  workId: idSchema,
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(200),
  fileSize: z.coerce.number().int().positive().max(MODEL_LIMITS.fileBytes),
});

/** Validate presentation geometry without creating print parts, prices or variants. */
export async function registerArAssetAction(_prev: StepActionState, data: FormData): Promise<StepActionState> {
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "AR用ファイルの情報が不正です" };
  const file = parsed.data;
  const owned = await requireOwnWork(file.workId);
  if (!owned.ok) return { error: owned.error };
  if (!file.storagePath.startsWith(`${owned.user.id}/${file.workId}/`)) return { error: "アップロード先が不正です" };
  const format = workModelExtension(file.fileName);
  if (!format) return { error: "STL・3MF・Blender (.blend) のファイルを選んでください" };
  try {
    const buffer = await readModel(file.storagePath, "work-ar");
    if (buffer.byteLength !== file.fileSize) return { error: "ファイルのサイズが一致しません" };
    const budget = new AnalysisBudget();
    buildWorkMeshes(readModelObjects(buffer, file.fileName, budget), 1, budget);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AR用ファイルを読み込めませんでした" };
  }
  try {
    await owned.db.insertInto("work_ar_assets").values({
      work_id: file.workId, storage_path: file.storagePath, file_name: file.fileName,
      file_format: format, file_size_bytes: file.fileSize,
    }).onConflict((conflict) => conflict.column("work_id").doUpdateSet({
      storage_path: file.storagePath, file_name: file.fileName, file_format: format,
      file_size_bytes: file.fileSize, updated_at: new Date().toISOString(),
    })).execute();
  } catch {
    return { error: "AR用ファイルを保存できませんでした" };
  }
  revalidatePath(`/studio/works/${file.workId}/steps/4`);
  revalidatePath(`/works/${file.workId}`);
  return { error: null, ok: true };
}

"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getOptionalUser, getUserProfile } from "@/lib/auth/guards";
import { uploadPolicy } from "./s3";
import { MODEL_LIMITS } from "@/lib/print/limits";

const uploadSchema = z.object({
  group: z.enum(["work-stl", "work-ar", "work-images", "qc-photos"]),
  workId: z.uuid(),
  jobId: z.uuid().optional(),
  fileName: z.string().min(1).max(200),
  bytes: z.number().int().positive(),
  contentType: z.string().max(100),
});

export async function prepareUpload(input: z.input<typeof uploadSchema>) {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { error: "アップロード情報が不正です" };
  const { group, workId, jobId, fileName, bytes, contentType } = parsed.data;
  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };
  const { profile } = await getUserProfile();
  let folder: string;
  if (group === "qc-photos") {
    if (profile?.role !== "admin" || !jobId)
      return { error: "検品写真を登録する権限がありません" };
    const job = await db
      .selectFrom("print_queue")
      .select("id")
      .where("id", "=", jobId)
      .where("work_id", "=", workId)
      .executeTakeFirst();
    if (!job) return { error: "印刷ジョブが見つかりません" };
    folder = `${workId}/${jobId}`;
  } else {
    if (profile?.role !== "creator" && profile?.role !== "admin")
      return { error: "作品を編集する権限がありません" };
    const work = await db
      .selectFrom("works")
      .select("id")
      .where("id", "=", workId)
      .where("creator_id", "=", user.id)
      .executeTakeFirst();
    if (!work) return { error: "作品を編集する権限がありません" };
    folder = `${user.id}/${workId}`;
  }
  const extension = fileName.split(".").pop()?.toLowerCase();
  const isModel = group === "work-stl" || group === "work-ar";
  const maxBytes =
    isModel
      ? MODEL_LIMITS.fileBytes
      : (group === "qc-photos" ? 8 : 10) * 1024 * 1024;
  if (bytes > maxBytes) return { error: "ファイルが大きすぎます" };
  if (
    isModel
      ? !(group === "work-ar" ? ["stl", "3mf", "blend"] : ["stl", "3mf"]).includes(extension ?? "")
      : !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          contentType,
        )
  )
    return { error: "対応していないファイル形式です" };
  const path = `${folder}/${randomUUID()}.${isModel ? extension : contentType.split("/")[1]}`;
  try {
    return {
      path,
      ...(await uploadPolicy(
        group,
        path,
        isModel ? "application/octet-stream" : contentType,
        bytes,
      )),
    };
  } catch (error) {
    console.error(
      "S3 upload preparation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return { error: "アップロード先を準備できませんでした" };
  }
}

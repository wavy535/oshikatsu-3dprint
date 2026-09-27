"use client";
import { prepareUpload } from "./actions";

export async function uploadFile(
  group: "work-stl" | "work-ar" | "work-images" | "qc-photos",
  file: File,
  workId: string,
  jobId?: string,
) {
  const policy = await prepareUpload({
    group,
    fileName: file.name,
    contentType: file.type,
    bytes: file.size,
    workId,
    jobId,
  });
  if (!("path" in policy))
    throw new Error(policy.error ?? "アップロードを開始できませんでした");
  const response = await fetch(policy.url, {
    method: policy.method,
    headers: policy.headers,
    body: file,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error("ファイルの送信に失敗しました");
  return policy.path;
}

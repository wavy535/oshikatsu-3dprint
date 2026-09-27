import "server-only";
import { createHash } from "node:crypto";
import { platform } from "@/lib/platform";
import { siteUrl } from "@/lib/site";
import { signFileClaim, type FileClaim } from "./capability";
import { checkModelFileSize } from "@/lib/print/limits";

export type FileGroup = "work-stl" | "work-ar" | "work-images" | "qc-photos" | "avatars" | "ar-cache";

export function objectKey(group: FileGroup, path: string) {
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..") || /[\\\x00-\x1f]/.test(path))
    throw new Error("Invalid object path");
  return `${group}/${path}`;
}

async function capabilityUrl(claim: FileClaim) {
  return `${siteUrl()}/api/files/transfer?token=${await signFileClaim(claim)}`;
}

/** Caller must authorize the exact path before issuing a short-lived capability. */
export function signedDownload(group: FileGroup, path: string, expiresIn = 300) {
  return capabilityUrl({ version: 1, operation: "read", key: objectKey(group, path),
    expires: Math.floor(Date.now() / 1000) + Math.min(expiresIn, 300) });
}

export async function readModel(path: string, group: "work-stl" | "work-ar" = "work-stl") {
  const object = await platform().FILES.get(objectKey(group, path));
  if (!object) throw new Error("3Dデータを読み込めませんでした");
  const reader = object.body.getReader();
  try {
    checkModelFileSize(object.size);
    const buffer = Buffer.allocUnsafe(object.size);
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > object.size) throw new Error("3Dデータのサイズが申告値を超えています");
      buffer.set(value, offset); offset += value.byteLength;
    }
    if (offset !== object.size) throw new Error("3Dデータが途中で途切れています");
    return buffer;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function checkStoredFile(group: FileGroup, path: string, maxBytes: number) {
  const object = await platform().FILES.head(objectKey(group, path));
  if (!object?.size || object.size > maxBytes) throw new Error("ファイルサイズが不正です");
  if (!["work-stl", "work-ar"].includes(group) &&
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(object.httpMetadata?.contentType ?? ""))
    throw new Error("画像の形式が不正です");
  return object.size;
}

export async function uploadPolicy(group: FileGroup, path: string, contentType: string, bytes: number) {
  return { url: await capabilityUrl({ version: 1, operation: "write", key: objectKey(group, path),
    bytes, contentType, expires: Math.floor(Date.now() / 1000) + 120 }),
    method: "PUT" as const, headers: { "Content-Type": contentType } };
}

export async function storeArModel(bytes: Uint8Array, format: "glb" | "usdz", contentType: string, cachePath?: string) {
  const path = cachePath ?? `${createHash("sha256").update(bytes).digest("hex")}.${format}`;
  await platform().FILES.put(objectKey("ar-cache", path), bytes, {
    httpMetadata: { contentType, cacheControl: "private, max-age=300" },
  });
  return signedDownload("ar-cache", path);
}

export async function findArModel(path: string): Promise<string | null> {
  const object = await platform().FILES.head(objectKey("ar-cache", path));
  if (!object || Date.now() - object.uploaded.getTime() >= 6 * 86400_000) return null;
  return signedDownload("ar-cache", path);
}

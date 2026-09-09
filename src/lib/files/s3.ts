import "server-only";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type FileGroup = "work-stl" | "work-images" | "qc-photos" | "avatars";
let client: S3Client | undefined;
export function s3Client() {
  if (!client) {
    const region = process.env.AWS_REGION;
    if (!region) throw new Error("AWS_REGION is required for S3");
    const endpoint = process.env.S3_ENDPOINT;
    client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(endpoint &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return client;
}

function object(group: FileGroup, path: string) {
  const Bucket = process.env.S3_BUCKET;
  if (!Bucket) throw new Error("S3_BUCKET is required");
  if (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\x00-\x1f]/.test(path)
  )
    throw new Error("Invalid object path");
  return { Bucket, Key: `${group}/${path}` };
}

/** Call after authorizing the path. The public route allows image prefixes only. */
export function signedDownload(
  group: FileGroup,
  path: string,
  expiresIn = 300,
) {
  return getSignedUrl(s3Client(), new GetObjectCommand(object(group, path)), {
    expiresIn,
  });
}

export async function readModel(path: string) {
  const response = await s3Client().send(
    new GetObjectCommand(object("work-stl", path)),
    { abortSignal: AbortSignal.timeout(30_000) },
  );
  if (
    !response.Body ||
    !response.ContentLength ||
    response.ContentLength > 80 * 1024 * 1024
  ) {
    await response.Body?.transformToWebStream().cancel();
    throw new Error("3Dデータのサイズが不正です");
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function checkStoredFile(
  group: FileGroup,
  path: string,
  maxBytes: number,
) {
  const response = await s3Client().send(
    new HeadObjectCommand(object(group, path)),
    { abortSignal: AbortSignal.timeout(5_000) },
  );
  if (!response.ContentLength || response.ContentLength > maxBytes)
    throw new Error("ファイルサイズが不正です");
  if (
    group !== "work-stl" &&
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      response.ContentType ?? "",
    )
  )
    throw new Error("画像の形式が不正です");
  return response.ContentLength;
}

export async function uploadPolicy(
  group: FileGroup,
  path: string,
  contentType: string,
  bytes: number,
) {
  const { Bucket, Key } = object(group, path);
  return createPresignedPost(s3Client(), {
    Bucket,
    Key,
    Expires: 120,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", bytes, bytes],
      ["eq", "$Content-Type", contentType],
    ],
  });
}

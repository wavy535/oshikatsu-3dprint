import { createHash } from "node:crypto";
import { AR_LIMITS } from "./config.ts";

/**
 * 元データの保存先から URL に付ける版を作る。
 * 3Dデータを差し替えると保存先が変わるので、古いキャッシュを使い続けない。保存先そのものは外に出さない。
 */
export function assetVersion(storagePath: string) {
  return createHash("sha256").update(storagePath).digest("hex").slice(0, AR_LIMITS.assetVersionLength);
}

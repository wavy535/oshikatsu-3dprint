import { AR_LIMITS } from "./config.ts";
import type { ModelFormat } from "./params.ts";

// Quick Look は model/vnd.usdz+zip でないと AR として開かない
const CONTENT_TYPES: Record<ModelFormat, string> = {
  glb: "model/gltf-binary",
  usdz: "model/vnd.usdz+zip",
};

/**
 * 3Dモデルを返す。Scene Viewer・Quick Look が未ログインで取りに来るので、公開キャッシュを許す。
 * ただし URL の rev が今のモデルの版と違う（古いリンク・版なし）ときはキャッシュさせない。
 */
export function modelResponse(bytes: Uint8Array<ArrayBuffer>, format: ModelFormat, cacheable: boolean) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cacheable ? `public, max-age=${AR_LIMITS.cacheSeconds}` : "no-store",
    },
  });
}

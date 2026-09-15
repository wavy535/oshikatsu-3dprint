import { AR_LIMITS } from "./config.ts";

/** GLB を返す。Scene Viewer などが未ログインで取りに来るので、公開キャッシュを許す */
export function glbResponse(glb: Uint8Array<ArrayBuffer>) {
  return new Response(glb, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "Content-Length": String(glb.byteLength),
      "Cache-Control": `public, max-age=${AR_LIMITS.cacheSeconds}`,
    },
  });
}

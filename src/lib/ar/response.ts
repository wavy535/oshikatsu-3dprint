import { storeArModel } from "@/lib/files/s3";
import { encodeGlb } from "./glb.ts";
import { encodeUsdz } from "./usdz.ts";
import type { ArMesh } from "./mesh.ts";
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
export async function modelResponse(meshes: ArMesh[], format: ModelFormat, cacheable: boolean, cachePath?: string) {
  const bytes = format === "usdz" ? encodeUsdz(meshes) : encodeGlb(meshes);
  if (process.env.AR_MODEL_STORAGE === "s3") {
    const location = cachePath
      ? await storeArModel(bytes, format, CONTENT_TYPES[format], cachePath)
      : await storeArModel(bytes, format, CONTENT_TYPES[format]);
    return modelRedirect(location, cacheable);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cacheable ? `public, max-age=${AR_LIMITS.cacheSeconds}` : "no-store",
    },
  });
}

export function modelRedirect(location: string, cacheable: boolean) {
  return new Response(null, { status: 307, headers: {
    Location: location,
    "Cache-Control": cacheable ? "public, max-age=60" : "no-store",
  } });
}

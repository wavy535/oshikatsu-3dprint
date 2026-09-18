import { createHash } from "node:crypto";
import { isId, parseWorkFile, revisionOfUrl } from "@/lib/ar/params";
import { getArWorkSource } from "@/lib/ar/queries";
import { modelResponse, modelRedirect } from "@/lib/ar/response";
import { modelRevision } from "@/lib/ar/revision";
import { assetVersion } from "@/lib/ar/version";
import { buildWorkMeshes, isUnconvertibleModelError, readModelObjects } from "@/lib/ar/work-model";
import { readModel, findArModel } from "@/lib/files/s3";
import { AnalysisBudget } from "@/lib/print/limits";

/**
 * 作品の3Dデータを AR 用のモデルに変換して返す。公開中の作品・掲載中のサイズだけ。
 * 拡張子で GLB（model-viewer・Scene Viewer）か USDZ（QR コードから開く Quick Look）を選ぶ。
 * 返すのは間引いた色付きの形状で、印刷用の元データは返さない。
 * URL の v（元データの版）が現在のデータと一致しないときは、古いリンクとして扱う。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workId: string; file: string }> },
) {
  const { workId, file } = await params;
  const searchParams = new URL(request.url).searchParams;
  const work = parseWorkFile(file);
  const version = searchParams.get("v");
  if (!isId(workId) || !work || !version) return new Response(null, { status: 404 });

  const source = await getArWorkSource(workId, work.variantId);
  if (!source || assetVersion(source.storagePath) !== version)
    return new Response(null, { status: 404 });

  const revision = modelRevision();
  const current = revisionOfUrl(searchParams) === revision;
  const cachePath = `${createHash("sha256").update(JSON.stringify([
    "work-v1", source.storagePath, source.fileName, source.scaleRatio, revision, work.format,
  ])).digest("hex")}.${work.format}`;
  // Always check publication and asset version above, even on a cache hit.
  if (process.env.AR_MODEL_STORAGE === "s3") {
    const location = await findArModel(cachePath);
    if (location) return modelRedirect(location, current);
  }
  const budget = new AnalysisBudget();
  const buffer = await readModel(source.storagePath, "work-ar");
  try {
    const objects = readModelObjects(buffer, source.fileName, budget);
    const { meshes } = buildWorkMeshes(objects, source.scaleRatio, budget);
    return modelResponse(meshes, work.format, current, cachePath);
  } catch (error) {
    // 3Dデータの中身が原因のものは、サーバーの障害（S3・DB）と分けて 422 にする
    if (isUnconvertibleModelError(error)) return new Response(null, { status: 422 });
    throw error;
  }
}

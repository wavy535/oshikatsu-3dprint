import { encodeGlb } from "@/lib/ar/glb";
import { isId, parseWorkFile, revisionOfUrl } from "@/lib/ar/params";
import { getArWorkSource } from "@/lib/ar/queries";
import { modelResponse } from "@/lib/ar/response";
import { modelRevision } from "@/lib/ar/revision";
import { encodeUsdz } from "@/lib/ar/usdz";
import { assetVersion } from "@/lib/ar/version";
import { buildWorkMeshes, isUnconvertibleModelError, readModelObjects } from "@/lib/ar/work-model";
import { readModel } from "@/lib/files/s3";
import { AnalysisBudget } from "@/lib/print/limits";

/**
 * 作品の3Dデータを AR 用のモデルに変換して返す。公開中の作品・掲載中のサイズだけ。
 * 拡張子で GLB（model-viewer・Scene Viewer）か USDZ（QR コードから開く Quick Look）を選ぶ。
 * 返すのは間引いた単色の形状で、印刷用の元データは返さない。
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

  const budget = new AnalysisBudget();
  const buffer = await readModel(source.storagePath);
  try {
    const objects = readModelObjects(buffer, source.fileName, budget);
    const { meshes } = buildWorkMeshes(objects, source.scaleRatio, budget);
    const current = revisionOfUrl(searchParams) === modelRevision();
    return work.format === "usdz"
      ? modelResponse(encodeUsdz(meshes), "usdz", current)
      : modelResponse(encodeGlb(meshes), "glb", current);
  } catch (error) {
    // 3Dデータの中身が原因のものは、サーバーの障害（S3・DB）と分けて 422 にする
    if (isUnconvertibleModelError(error)) return new Response(null, { status: 422 });
    throw error;
  }
}

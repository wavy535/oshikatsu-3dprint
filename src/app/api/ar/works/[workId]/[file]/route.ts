import { ArInputError } from "@/lib/ar/errors";
import { encodeGlb } from "@/lib/ar/glb";
import { isId, parseWorkFile } from "@/lib/ar/params";
import { getArWorkSource } from "@/lib/ar/queries";
import { glbResponse } from "@/lib/ar/response";
import { assetVersion } from "@/lib/ar/version";
import { buildWorkMeshes, readModelObjects } from "@/lib/ar/work-model";
import { readModel } from "@/lib/files/s3";
import { AnalysisBudget, ModelLimitError } from "@/lib/print/limits";
import { StlParseError } from "@/lib/print/stl";
import { ThreeMfParseError } from "@/lib/print/threemf";
import { ZipError } from "@/lib/print/zip";

// 3Dデータの中身が原因で変換できないもの。サーバーの障害（S3・DB）とは分けて 422 にする
const MODEL_ERRORS = [ArInputError, ModelLimitError, StlParseError, ThreeMfParseError, ZipError];

/**
 * 作品の3Dデータを AR 用の GLB に変換して返す。公開中の作品・掲載中のサイズだけ。
 * 返すのは間引いた単色の形状で、印刷用の元データは返さない。
 * URL の v（元データの版）が現在のデータと一致しないときは、古いリンクとして扱う。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workId: string; file: string }> },
) {
  const { workId, file } = await params;
  const variantId = parseWorkFile(file);
  const version = new URL(request.url).searchParams.get("v");
  if (!isId(workId) || !variantId || !version) return new Response(null, { status: 404 });

  const source = await getArWorkSource(workId, variantId);
  if (!source || assetVersion(source.storagePath) !== version)
    return new Response(null, { status: 404 });

  const budget = new AnalysisBudget();
  const buffer = await readModel(source.storagePath);
  try {
    const objects = readModelObjects(buffer, source.fileName, budget);
    const { meshes } = buildWorkMeshes(objects, source.scaleRatio, budget);
    return glbResponse(encodeGlb(meshes));
  } catch (error) {
    if (MODEL_ERRORS.some((ErrorType) => error instanceof ErrorType))
      return new Response(null, { status: 422 });
    throw error;
  }
}

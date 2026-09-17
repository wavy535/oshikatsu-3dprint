import { AR_ANCHOR, AR_DEV_PAGE } from "@/lib/ar/config";
import { encodeGlb } from "@/lib/ar/glb";
import { readLocalModel } from "@/lib/ar/local-models";
import { parseLocalModelRequest } from "@/lib/ar/params";
import { modelResponse } from "@/lib/ar/response";
import { encodeUsdz } from "@/lib/ar/usdz";
import { buildWorkMeshes, isUnconvertibleModelError, readModelObjects } from "@/lib/ar/work-model";
import { AnalysisBudget } from "@/lib/print/limits";

/**
 * 開発用：手元のフォルダにある 3MF / STL / .blend を AR 用のモデルにして返す。本番では 404。
 * DB や S3 に登録していない実データを、実寸テストページの QR コードから iPhone で確かめるために使う。
 * .blend は ?exclude= のオブジェクトを外す。ファイルは置き換わるので、キャッシュさせない。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const { file } = await params;
  const local = parseLocalModelRequest(file, new URL(request.url).searchParams);
  if (!local) return new Response(null, { status: 404 });
  const buffer = await readLocalModel(local.name);
  if (!buffer) return new Response(null, { status: 404 });

  const budget = new AnalysisBudget();
  try {
    const model = readModelObjects(buffer, local.name, budget, { excludeObjects: local.excludeObjects });
    // 手元のファイルは部屋のデータを見るためのものなので、基準点は部屋と同じ奥の左下の角にする
    const { meshes } = buildWorkMeshes(model, AR_DEV_PAGE.localModelScale, budget, AR_ANCHOR.room);
    return local.format === "usdz"
      ? modelResponse(encodeUsdz(meshes), "usdz", false)
      : modelResponse(encodeGlb(meshes), "glb", false);
  } catch (error) {
    // 開発用なので、変換できない理由を本文で返す
    if (isUnconvertibleModelError(error)) return new Response(error.message, { status: 422 });
    throw error;
  }
}

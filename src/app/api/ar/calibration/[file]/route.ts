import { buildCalibrationMeshes } from "@/lib/ar/calibration";
import { parseCalibrationFile, revisionOfUrl } from "@/lib/ar/params";
import { modelResponse } from "@/lib/ar/response";
import { modelRevision } from "@/lib/ar/revision";

/** 校正用モデル（A4 の板など）。実寸テストで AR の縮尺を確かめるために使う。DB は読まない */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const calibration = parseCalibrationFile(file);
  if (!calibration) return new Response(null, { status: 404 });
  const meshes = buildCalibrationMeshes(calibration.model);
  const cacheable = revisionOfUrl(new URL(request.url).searchParams) === modelRevision();
  return modelResponse(meshes, calibration.format, cacheable);
}

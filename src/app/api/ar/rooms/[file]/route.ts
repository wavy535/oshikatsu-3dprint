import { encodeGlb } from "@/lib/ar/glb";
import { parseNuiQuery, parseRoomFile, revisionOfUrl } from "@/lib/ar/params";
import { modelResponse } from "@/lib/ar/response";
import { modelRevision } from "@/lib/ar/revision";
import { buildRoomMeshes } from "@/lib/ar/room";
import { encodeUsdz } from "@/lib/ar/usdz";

/**
 * 仮の部屋のモデル。拡張子で GLB（model-viewer・Scene Viewer）か USDZ（Quick Look）を返す。
 * 採寸値は URL で受け取り、DB は読まない。端末の AR ビューアが未ログインで取得するので、公開の GET にしている。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const searchParams = new URL(request.url).searchParams;
  const room = parseRoomFile(file);
  const nui = parseNuiQuery(searchParams);
  if (!room || !nui) return new Response(null, { status: 404 });
  const meshes = buildRoomMeshes(nui, room.layout);
  const cacheable = revisionOfUrl(searchParams) === modelRevision();
  return room.format === "usdz"
    ? modelResponse(encodeUsdz(meshes), "usdz", cacheable)
    : modelResponse(encodeGlb(meshes), "glb", cacheable);
}

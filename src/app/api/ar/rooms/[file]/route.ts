import { encodeGlb } from "@/lib/ar/glb";
import { parseNuiQuery, parseRoomFile } from "@/lib/ar/params";
import { glbResponse } from "@/lib/ar/response";
import { buildRoomMeshes } from "@/lib/ar/room";

/**
 * 仮の部屋の GLB。採寸値は URL で受け取り、DB は読まない。
 * Scene Viewer（Android）が未ログインで取得するので、公開の GET にしている。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const layout = parseRoomFile(file);
  const nui = parseNuiQuery(new URL(request.url).searchParams);
  if (!layout || !nui) return new Response(null, { status: 404 });
  return glbResponse(encodeGlb(buildRoomMeshes(nui, layout)));
}

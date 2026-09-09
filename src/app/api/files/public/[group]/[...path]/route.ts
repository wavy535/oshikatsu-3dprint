import { signedDownload } from "@/lib/files/s3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ group: string; path: string[] }> },
) {
  const { group, path } = await params;
  if (group !== "work-images" && group !== "avatars")
    return new Response(null, { status: 404 });
  try {
    const url = await signedDownload(group, path.join("/"));
    return new Response(null, {
      status: 307,
      headers: { Location: url, "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

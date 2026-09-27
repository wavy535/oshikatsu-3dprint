import { platform } from "@/lib/platform";
import { verifyFileClaim } from "@/lib/files/capability";

export async function PUT(request: Request) {
  const claim = await verifyFileClaim(new URL(request.url).searchParams.get("token"), "write");
  if (!claim?.bytes || !claim.contentType) return new Response(null, { status: 403 });
  if (!request.body || request.headers.get("content-type") !== claim.contentType ||
    request.headers.get("content-length") !== String(claim.bytes))
    return new Response(null, { status: 400 });
  // R2 commits only after the complete, correctly sized stream has arrived.
  const stream = new FixedLengthStream(claim.bytes);
  const results = await Promise.allSettled([
    request.body.pipeTo(stream.writable),
    platform().FILES.put(claim.key, stream.readable, { httpMetadata: { contentType: claim.contentType } }),
  ]);
  if (results.some((result) => result.status === "rejected")) return new Response(null, { status: 400 });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const claim = await verifyFileClaim(new URL(request.url).searchParams.get("token"), "read");
  if (!claim) return new Response(null, { status: 403 });
  const object = await platform().FILES.get(claim.key, { range: request.headers });
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes", ETag: object.httpEtag });
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  const range = object.range;
  if (request.headers.has("range") && range && "offset" in range && "length" in range && range.offset !== undefined && range.length !== undefined) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set("Content-Length", String(range.length));
  } else headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: headers.has("Content-Range") ? 206 : 200, headers });
}

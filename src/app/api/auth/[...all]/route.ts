import { getAuth } from "@/lib/auth/config";
import { authHeaders } from "@/lib/auth/request";

async function handler(request: Request) {
  // Next.js can proxy the incoming Request; construct from its URL instead of
  // passing that proxy to the native Request constructor.
  return getAuth().handler(
    new Request(request.url, {
      method: request.method,
      headers: authHeaders(request.headers),
      body: request.method === "POST" ? await request.text() : undefined,
    }),
  );
}

export { handler as GET, handler as POST };

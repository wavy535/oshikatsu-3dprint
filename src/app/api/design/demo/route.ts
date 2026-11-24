import { platform } from "@/lib/platform";
import { createDemoBrowser, readDemoBrowser } from "@/lib/design/ai/demo-session";
import { demoQuota } from "@/lib/design/ai/demo-quota";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "デモ画面からアクセスしてください。" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const existing = await readDemoBrowser(request);
    const browser = existing ? { id: existing, cookie: null } : await createDemoBrowser(request);
    const usage = await demoQuota(platform().DATABASE, browser.id);
    return Response.json(usage, {
      headers: { "Cache-Control": "private, no-store", ...(browser.cookie ? { "Set-Cookie": browser.cookie } : {}) },
    });
  } catch {
    return Response.json({ error: "デモを準備できませんでした。ページを再読み込みしてください。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

import { platform } from "@/lib/platform";
import { CHAT_BODY_LIMIT } from "@/lib/design/reference-images";
import { chatRequestSchema } from "@/lib/design/ai-contract";
import { boundedJson } from "@/lib/design/ai/bounded-json";
import { runDesignChat, openAiCall } from "@/lib/design/ai/harness";
import { readDemoBrowser } from "@/lib/design/ai/demo-session";
import { reserveDemoChat } from "@/lib/design/ai/demo-quota";
import type { DemoQuota } from "@/lib/design/demo-policy";

function json(body: unknown, status = 200, quota?: DemoQuota) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store",
    ...(quota ? {
      "X-Demo-Remaining": String(quota.remaining),
      "X-Demo-Reset-At": String(quota.resetAt),
      ...(status === 429 ? { "Retry-After": String(quota.remaining ? 8 : Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1000))) } : {}),
    } : {}),
  } });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "デモ画面から送信してください。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSONで送信してください。" }, 415);
  try {
    const browserId = await readDemoBrowser(request);
    if (!browserId) return json({ error: "デモ画面を開き直し、Cookieを有効にしてお試しください。" }, 403);
    const env = platform();
    if (!env.OPENAI_API_KEY) return json({ error: "AI編集の接続を準備中です。手動編集は利用できます。" }, 503);
    let input;
    try { input = chatRequestSchema.parse(await boundedJson(request.body, CHAT_BODY_LIMIT)); }
    catch { return json({ error: "入力を確認してください。指示は1000文字、添付画像は2枚までです。" }, 400); }
    const reservation = await reserveDemoChat(env.DATABASE, browserId);
    const quota = reservation.quota;
    if (!reservation.allowed) return json({ error: quota.remaining
      ? "利用上限に達したか、送信間隔が短すぎます。8秒以上待って再送してください。"
      : "本日のデモ利用上限に達しました。翌日9時（日本時間）以降にお試しください。手動編集・保存は引き続き使えます。",
    }, 429, quota);
    try {
      const reply = await runDesignChat(input, { call: openAiCall(env.OPENAI_API_KEY), signal: request.signal });
      return json(reply, 200, quota);
    } catch (error) {
      const safe = error instanceof Error && /^(AI|この依頼|寸法条件|変更を)/.test(error.message);
      return json({ error: safe ? error.message : "AI編集を完了できませんでした。元の設計は保持しています。再送してください。" }, 502, quota);
    }
  } catch {
    return json({ error: "AIデモを利用できません。時間をおいて再送してください。" }, 503);
  }
}

import { getOptionalUser } from "@/lib/auth/guards";
import { platform } from "@/lib/platform";
import { CHAT_BODY_LIMIT } from "@/lib/design/reference-images";
import { chatRequestSchema } from "@/lib/design/ai-contract";
import { boundedJson } from "@/lib/design/ai/bounded-json";
import { runDesignChat, openAiCall } from "@/lib/design/ai/harness";
import { reserveChat } from "@/lib/design/ai/quota";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  // Mutating/paid requests must originate from this app, including local preview.
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "この画面から送信してください。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSONで送信してください。" }, 415);
  try {
    const { user } = await getOptionalUser();
    if (!user) return json({ error: "AIで編集するにはログインしてください。手動編集はそのまま使えます。" }, 401);
    const env = platform();
    if (!env.OPENAI_API_KEY) return json({ error: "AI編集の接続を準備中です。手動編集は利用できます。" }, 503);
    let input;
    try { input = chatRequestSchema.parse(await boundedJson(request.body, CHAT_BODY_LIMIT)); }
    catch { return json({ error: "入力を確認してください。指示は1000文字、添付画像は2枚までです。" }, 400); }
    if (!await reserveChat(env.DATABASE, user.id)) return json({ error: "利用上限に達したか、送信間隔が短すぎます。8秒以上待って再送してください（1人1日30回まで）。" }, 429);
    try {
      const reply = await runDesignChat(input, { call: openAiCall(env.OPENAI_API_KEY), signal: request.signal });
      return json(reply);
    } catch (error) {
      // Known harness messages are safe; schema and transport errors are not reflected.
      const safe = error instanceof Error && /^(AI|この依頼|寸法条件|変更を)/.test(error.message);
      return json({ error: safe ? error.message : "AI編集を完了できませんでした。元の設計は保持しています。再送してください。" }, 502);
    }
  } catch {
    return json({ error: "AI編集を利用できません。時間をおいて再送してください。" }, 503);
  }
}

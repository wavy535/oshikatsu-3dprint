import { z } from "zod";
import { applyProposal, chatRequestSchema, proposalSchema, type ChatRequest, type ChatReply } from "../ai-contract.ts";
import { parseDesign, checkDesign } from "../document.ts";
import { HOUSE_DESIGN_SKILL } from "./skill.ts";
import { boundedJson } from "./bounded-json.ts";

export const DEFAULT_DESIGN_MODEL = "gpt-4.1-mini";
export const DESIGN_MODELS = ["gpt-4.1-mini", "gpt-5-mini"] as const;
export type DesignModel = typeof DESIGN_MODELS[number];
const schema = z.toJSONSchema(proposalSchema);
delete schema.$schema;
const responseSchema = z.object({
  status: z.string(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});
export type ModelCall = (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
export function openAiCall(apiKey: string): ModelCall {
  return async (input, signal) => {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(input), signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Never expose provider bodies, credentials, or arbitrary upstream errors.
      throw new Error(response.status === 429 ? "AIが混み合っています。少し待って再送してください。" : "AIに接続できませんでした。時間をおいて再送してください。");
    }
    return boundedJson(response.body, 64 * 1024);
  };
}

/** At most two calls: propose, validate, repair once against the ORIGINAL snapshot. */
export async function runDesignChat(value: ChatRequest, options: {
  call: ModelCall; model?: DesignModel; signal?: AbortSignal;
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}): Promise<ChatReply> {
  const request = chatRequestSchema.parse(value);
  parseDesign(request.design);
  const model = options.model ?? DEFAULT_DESIGN_MODEL;
  if (!DESIGN_MODELS.includes(model)) throw new Error("対応していないモデルです。");
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(45_000)]);
  const context = JSON.stringify({ currentDesign: request.design, selectedPart: request.selected, checks: checkDesign(request.design), history: request.history, instruction: request.message });
  let correction = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    signal.throwIfAborted();
    const raw = await options.call({
      model, store: false, max_output_tokens: 2000,
      ...(model === "gpt-5-mini" ? { reasoning: { effort: "minimal" } } : {}),
      instructions: HOUSE_DESIGN_SKILL,
      input: [{ role: "user", content: context }, ...(correction ? [{ role: "developer", content: correction }] : [])],
      text: { format: { type: "json_schema", name: "house_design_edit", strict: true, schema } },
    }, signal);
    signal.throwIfAborted();
    const response = responseSchema.parse(raw);
    if (response.usage) options.onUsage?.(response.usage);
    if (response.status !== "completed") throw new Error("AIの応答が完了しませんでした。指示を短くして再送してください。");
    const content = response.output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    if (content.some((c) => c.type === "refusal")) throw new Error("この依頼には対応できません。おうちの寸法や部品について指示してください。");
    const text = content.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    try {
      const { proposal, design } = applyProposal(request.design, JSON.parse(text));
      return { ...proposal, design, attempts: attempt };
    } catch (error) {
      if (attempt === 2) throw new Error("寸法条件を満たす変更を作れませんでした。元の設計は保持しています。指示を具体的にして再送してください。");
      const detail = error instanceof z.ZodError ? "出力の項目・型・範囲が不正です。許可された変更だけを返してください。" : error instanceof Error ? error.message : "変更が不正です。";
      correction = `前の提案は適用されていません。元のcurrentDesignから再提案してください。検証結果: ${detail.slice(0, 1000)}\n前の提案: ${text.slice(0, 6000)}\n希望を満たせなければchanges=[]で説明してください。`;
    }
  }
  throw new Error("変更を作れませんでした。");
}

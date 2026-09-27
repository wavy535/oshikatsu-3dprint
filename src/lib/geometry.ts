import "server-only";
import { platform } from "@/lib/platform";
import { objectKey, readModel } from "@/lib/files/storage";
import { checkModelFileSize } from "@/lib/print/limits";
import { analyzeModelFile, type AssetAnalysis, type PricingRule } from "@/lib/print";

export class GeometryError extends Error {
  constructor(message: string, readonly status: 422 | 503) {
    super(message);
    this.name = "GeometryError";
  }
}

export async function geometryRequest(operation: string, path: string, fileName: string,
  group: "work-stl" | "work-ar", expectedBytes?: number, rule?: PricingRule) {
  const env = platform();
  if (!env.GEOMETRY) throw new Error("GEOMETRY binding is required");
  const file = await env.FILES.get(objectKey(group, path));
  if (!file) throw new Error("3Dデータを読み込めませんでした");
  checkModelFileSize(file.size);
  if (expectedBytes !== undefined && file.size !== expectedBytes) throw new Error("ファイルのサイズが一致しません");
  const response = await env.GEOMETRY.fetch(`http://geometry${operation}`, {
    method: "POST", headers: { "Content-Length": String(file.size), "Content-Type": "application/octet-stream",
      "X-Model-Filename": encodeURIComponent(fileName), ...(rule ? { "X-Pricing-Rule": JSON.stringify(rule) } : {}) },
    body: file.body, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    if (response.status === 422) {
      // The private geometry service returns a bounded diagnostic, never model data.
      const reader = response.body?.getReader();
      if (reader) {
        let message = "";
        const decoder = new TextDecoder();
        try {
          while (message.length <= 4096) {
            const { done, value } = await reader.read();
            if (done) break;
            message += decoder.decode(value, { stream: true });
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (message.length <= 4096) {
          let diagnostic: { error?: unknown } = {};
          try { diagnostic = JSON.parse(message); } catch { /* malformed response */ }
          if (typeof diagnostic.error === "string" && diagnostic.error.length <= 500) throw new GeometryError(diagnostic.error, 422);
        }
      }
    }
    await response.body?.cancel();
    throw new GeometryError(response.status === 503 ? "解析が混み合っています。少し待って再実行してください" : "3Dデータを処理できませんでした。形状とサイズを確認してください", response.status === 422 ? 422 : 503);
  }
  return response;
}

export async function analyzeStoredModel(path: string, fileName: string, rule: PricingRule, expectedBytes?: number): Promise<{ analysis: AssetAnalysis; bytes: number }> {
  if (platform().GEOMETRY) return (await geometryRequest("/analyze", path, fileName, "work-stl", expectedBytes, rule)).json();
  // Pure Node test/tool path. Production must fail closed if the binding is missing.
  if (process.env.APP_RUNTIME === "cloudflare") throw new Error("GEOMETRY binding is required");
  const buffer = await readModel(path);
  if (expectedBytes !== undefined && buffer.byteLength !== expectedBytes) throw new Error("ファイルのサイズが一致しません");
  return { analysis: analyzeModelFile(buffer, { fileName, rule }), bytes: buffer.byteLength };
}

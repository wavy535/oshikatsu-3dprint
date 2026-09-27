import { createServer } from "node:http";
import { Worker } from "node:worker_threads";

let busy = false;
const server = createServer(async (req, res) => {
  if (req.url === "/health") { res.end("ok"); return; }
  const operation = new URL(req.url, "http://geometry").pathname;
  const length = Number(req.headers["content-length"]);
  if (req.method !== "POST" || !["/analyze", "/validate-ar", "/convert-ar"].includes(operation)) {
    res.writeHead(404).end(); return;
  }
  if (!Number.isSafeInteger(length) || length <= 0 || length > 80 * 1024 * 1024) {
    res.writeHead(413).end(); return;
  }
  if (busy) { res.writeHead(503, { "Retry-After": "1" }).end(); return; }
  busy = true;
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for await (const chunk of req) {
      if (offset + chunk.length > length) throw new Error("Invalid input length");
      bytes.set(chunk, offset); offset += chunk.length;
    }
    if (offset !== length) throw new Error("Incomplete input");
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("runner.ts", import.meta.url), {
        workerData: { operation, url: req.url, headers: req.headers, bytes },
        transferList: [bytes.buffer], resourceLimits: { maxOldGenerationSizeMb: 1024 },
      });
      const timer = setTimeout(() => {
        void worker.terminate(); reject(new Error("Geometry timeout"));
      }, 30_000);
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => { clearTimeout(timer); if (code !== 0) reject(new Error("Geometry worker failed")); });
    });
    if (result.error) { res.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error })); return; }
    if (result.model) {
      res.writeHead(200, { "Content-Type": result.contentType, "Content-Length": String(result.model.byteLength) }).end(result.model);
    } else res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch {
    res.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "3Dデータを処理できませんでした。ファイルのサイズと形状を確認してください" }));
  } finally { busy = false; }
});
server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT || 8080), "0.0.0.0");

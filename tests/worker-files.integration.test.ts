import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signFileClaim } from "@/lib/files/capability";
const enabled = process.env.TEST_WORKER === "true";
const base = process.env.E2E_BASE_URL || "http://localhost:3000";

describe.skipIf(!enabled)("local Worker R2 transfer", () => {
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local tests only");
  });
  afterEach(() => vi.unstubAllEnvs());
  async function url(operation: "read" | "write", key: string, bytes?: number) {
    const env = parseEnv(await readFile(".dev.vars", "utf8"));
    vi.stubEnv("AUTH_SECRET", env.AUTH_SECRET);
    return `${base}/api/files/transfer?token=${await signFileClaim({ version: 1, operation, key,
      expires: Math.floor(Date.now() / 1000) + 120, ...(bytes ? { bytes, contentType: "image/png" } : {}) })}`;
  }
  test("streams a file, serves full reads as 200 and range reads as 206", async () => {
    const key = `ar-cache/test-${crypto.randomUUID()}.png`;
    const data = new Uint8Array([137,80,78,71,13,10,26,10]);
    const upload = await fetch(await url("write", key, data.length), { method: "PUT", headers: { "Content-Type": "image/png" }, body: data });
    expect(upload.status).toBe(204);
    const downloadUrl = await url("read", key);
    const response = await fetch(downloadUrl);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(data);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const partial = await fetch(downloadUrl, { headers: { Range: "bytes=1-3" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 1-3/8");
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(data.slice(1,4));
    expect((await fetch(downloadUrl, { method: "HEAD" })).status).toBe(200);
  });
  test("wrong size never creates an object; read capabilities cannot authorize uploads", async () => {
    const key = `ar-cache/rejected-${crypto.randomUUID()}.png`;
    const data = new Uint8Array(9);
    const response = await fetch(await url("write", key, 8), { method: "PUT", headers: { "Content-Type": "image/png" }, body: data });
    expect(response.status).toBe(400);
    await response.body?.cancel();
    const readUrl = await url("read", key);
    expect((await fetch(readUrl)).status).toBe(404);
    const forbidden = await fetch(readUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: data });
    expect(forbidden.status).toBe(403);
    await forbidden.body?.cancel();
  });
});

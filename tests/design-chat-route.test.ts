import { beforeEach, expect, test, vi } from "vitest";
import { defaultDesign } from "../src/lib/design/document";
const mocks = vi.hoisted(() => ({ user: vi.fn(), platform: vi.fn(), reserve: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getOptionalUser: mocks.user }));
vi.mock("@/lib/platform", () => ({ platform: mocks.platform }));
vi.mock("@/lib/design/ai/quota", () => ({ reserveChat: mocks.reserve }));
vi.mock("@/lib/design/ai/harness", () => ({ runDesignChat: mocks.run, openAiCall: () => vi.fn() }));
import { POST } from "../src/app/api/design/chat/route";
const payload = () => ({ design: defaultDesign(), message: "青い屋根", history: [], selected: "back" });
const request = (body: unknown = payload(), origin = "https://example.test") => new Request("https://example.test/api/design/chat", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  mocks.user.mockResolvedValue({ user: { id: "member" } });
  mocks.platform.mockReturnValue({ OPENAI_API_KEY: "test-secret-not-real", DATABASE: {} });
  mocks.reserve.mockResolvedValue(true);
  mocks.run.mockResolvedValue({ message: "変更なし", changes: [], design: defaultDesign(), attempts: 1 });
});
test("rejects cross-origin and anonymous calls without spending provider quota", async () => {
  expect((await POST(request(payload(), "https://evil.test"))).status).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ user: null });
  expect((await POST(request())).status).toBe(401);
  expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
});
test("rejects unconfigured, invalid, oversized and rate-limited requests before model invocation", async () => {
  mocks.platform.mockReturnValueOnce({ DATABASE: {} });
  expect((await POST(request())).status).toBe(503);
  expect((await POST(request({ ...payload(), model: "expensive-model" }))).status).toBe(400);
  expect((await POST(request({ ...payload(), message: "x".repeat(25000) }))).status).toBe(400);
  mocks.reserve.mockResolvedValueOnce(false);
  expect((await POST(request())).status).toBe(429);
  expect(mocks.run).not.toHaveBeenCalled();
});
test("valid response is private; arbitrary provider/DB exceptions cannot leak", async () => {
  const ok = await POST(request());
  expect(ok.status).toBe(200); expect(ok.headers.get("cache-control")).toBe("no-store");
  expect(mocks.reserve.mock.calls[0][1]).toBe("member");
  mocks.run.mockRejectedValueOnce(new Error("internal secret test-secret-not-real"));
  const bad = await POST(request());
  expect(bad.status).toBe(502); expect(await bad.text()).not.toContain("test-secret-not-real");
  mocks.reserve.mockRejectedValueOnce(new Error("database secret"));
  expect((await POST(request())).status).toBe(503);
});

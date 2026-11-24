import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { localD1 } from "./helpers/d1";
import { defaultDesign } from "../src/lib/design/document";
import { CHAT_BODY_LIMIT } from "../src/lib/design/reference-images";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ platform: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/platform", () => ({ platform: mocks.platform }));
vi.mock("@/lib/design/ai/harness", () => ({ runDesignChat: mocks.run, openAiCall: () => vi.fn() }));
import { GET } from "../src/app/api/design/demo/route";
import { POST } from "../src/app/api/design/demo/chat/route";
import { createDemoBrowser, readDemoBrowser } from "../src/lib/design/ai/demo-session";
import { demoQuota, reserveDemoChat } from "../src/lib/design/ai/demo-quota";

const origin = "https://example.test";
const day = Date.UTC(2026, 10, 24);
let now: number;
let local: ReturnType<typeof localD1>;
const payload = () => ({ design: defaultDesign(), message: "屋根を青くして", selected: "back", history: [] });
function request(cookie?: string, body: unknown = payload(), requestOrigin = origin) {
  return new Request(`${origin}/api/design/demo/chat`, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
const status = (cookie?: string) => new Request(`${origin}/api/design/demo`, { headers: cookie ? { cookie } : {} });

beforeEach(() => {
  now = day + 60_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubEnv("AUTH_SECRET", "demo-test-secret-with-at-least-32-characters");
  local = localD1();
  mocks.platform.mockReturnValue({ DATABASE: local.binding, OPENAI_API_KEY: "test-secret-not-real" });
  mocks.run.mockResolvedValue({ message: "変更なし", changes: [], design: defaultDesign(), attempts: 1 });
});
afterEach(() => {
  local.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("demo preparation creates a private signed browser cookie without creating an account", async () => {
  const response = await GET(status());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict"); expect(cookie).toContain("Path=/api/design/demo");
  const id = await readDemoBrowser(status(cookie));
  expect(id).toBeTruthy();
  const again = await GET(status(cookie));
  expect(again.headers.get("set-cookie")).toBeNull();
  expect(await again.json()).toEqual({ remaining: 30, globalRemaining: 100, resetAt: day + 86_400_000 });
  expect(local.sqlite.prepare("SELECT count(*) AS n FROM app_users").get()!.n).toBe(0);
});

test("tampered, expired and cross-origin demo access cannot spend provider quota", async () => {
  const { cookie } = await createDemoBrowser(status());
  const tampered = cookie.replace(/=./, "=x");
  expect(await readDemoBrowser(status(tampered))).toBeNull();
  expect((await POST(request(tampered))).status).toBe(403);
  expect((await POST(request())).status).toBe(403);
  expect((await POST(request(cookie, payload(), "https://evil.test"))).status).toBe(403);
  expect((await GET(new Request(`${origin}/api/design/demo`, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
  now += 30 * 86_400_000;
  expect(await readDemoBrowser(status(cookie))).toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();
});

test("invalid input and missing provider configuration do not consume demo reservations", async () => {
  const { cookie, id } = await createDemoBrowser(status());
  expect((await POST(request(cookie, { ...payload(), model: "custom-model" }))).status).toBe(400);
  expect((await POST(request(cookie, { ...payload(), message: "x".repeat(CHAT_BODY_LIMIT + 1) }))).status).toBe(400);
  mocks.platform.mockReturnValueOnce({ DATABASE: local.binding });
  expect((await POST(request(cookie))).status).toBe(503);
  expect((await demoQuota(local.binding, id)).remaining).toBe(30);
  expect(mocks.run).not.toHaveBeenCalled();
});

test("anonymous requests retain quota across reloads and provider failures, with an 8s cooldown", async () => {
  const { cookie } = await createDemoBrowser(status());
  const first = await POST(request(cookie));
  expect(first.status).toBe(200); expect(first.headers.get("x-demo-remaining")).toBe("29");
  expect(mocks.run).toHaveBeenCalledTimes(1);
  const cooldown = await POST(request(cookie));
  expect(cooldown.status).toBe(429); expect(cooldown.headers.get("retry-after")).toBe("8");
  expect(mocks.run).toHaveBeenCalledTimes(1);
  now += 8000;
  mocks.run.mockRejectedValueOnce(new Error("internal secret test-secret-not-real"));
  const failure = await POST(request(cookie));
  expect(failure.status).toBe(502); expect(await failure.text()).not.toContain("test-secret-not-real");
  expect(failure.headers.get("x-demo-remaining")).toBe("28");
  expect(await (await GET(status(cookie))).json()).toMatchObject({ remaining: 28 });
});

test("thirty browser requests exhaust the daily demo and UTC midnight resets its allowance", async () => {
  const { cookie } = await createDemoBrowser(status());
  for (let index = 0; index < 30; index++) {
    expect((await POST(request(cookie))).status).toBe(200);
    now += 8000;
  }
  const exhausted = await POST(request(cookie));
  expect(exhausted.status).toBe(429);
  expect(exhausted.headers.get("x-demo-remaining")).toBe("0");
  expect(await exhausted.text()).toContain("本日のデモ利用上限");
  expect(mocks.run).toHaveBeenCalledTimes(30);
  now = day + 86_400_000;
  expect(await (await GET(status(cookie))).json()).toMatchObject({ remaining: 30 });
  expect((await POST(request(cookie))).status).toBe(200);
});

test("new browsers cannot bypass the demo-wide daily cap or consume member quota", async () => {
  for (let index = 0; index < 100; index++)
    expect((await reserveDemoChat(local.binding, `browser-${index}`, now)).allowed).toBe(true);
  const { cookie, id } = await createDemoBrowser(status());
  expect(await demoQuota(local.binding, id)).toMatchObject({ remaining: 0, globalRemaining: 0 });
  expect((await POST(request(cookie))).status).toBe(429);
  expect(mocks.run).not.toHaveBeenCalled();
  expect(local.sqlite.prepare("SELECT count(*) AS n FROM ai_design_usage").get()!.n).toBe(0);
});

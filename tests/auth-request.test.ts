import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authHeaders } from "@/lib/auth/request";
afterEach(() => vi.unstubAllEnvs());
test.each(["203.0.113.5", "2001:db8::5"])("Cloudflare uses connecting IP %s instead of caller forwarding headers", (ip) => {
  vi.stubEnv("APP_RUNTIME", "cloudflare");
  const incoming = new Headers({ "cf-connecting-ip": ip, "x-forwarded-for": "198.51.100.10", cookie: "session=preserved" });
  const result = authHeaders(incoming);
  expect(result.get("x-forwarded-for")).toBe(ip);
  expect(result.get("cookie")).toBe("session=preserved");
  expect(incoming.get("x-forwarded-for")).toBe("198.51.100.10");
});
test("missing or malformed platform IP shares one limiter", () => {
  vi.stubEnv("APP_RUNTIME", "cloudflare");
  for (const value of ["", "invalid", "1.1.1.1, 2.2.2.2"])
    expect(authHeaders(new Headers({ "cf-connecting-ip": value, "x-forwarded-for": "198.51.100.10" })).get("x-forwarded-for")).toBe("127.0.0.1");
});
test("local Node requests use the final forwarding hop", () => {
  vi.stubEnv("APP_RUNTIME", "");
  expect(authHeaders(new Headers({ "x-forwarded-for": "198.51.100.10, 127.0.0.1" })).get("x-forwarded-for")).toBe("127.0.0.1");
});

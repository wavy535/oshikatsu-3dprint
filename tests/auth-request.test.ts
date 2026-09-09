import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authHeaders } from "@/lib/auth/request";

afterEach(() => vi.unstubAllEnvs());

test.each(["203.0.113.5", "2001:db8::5"])(
  "Lambda auth uses the event source IP %s even with a supplied forwarding header",
  (sourceIp) => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "oshinest-test");
    const incoming = new Headers({
      "x-forwarded-for": "198.51.100.10, 198.51.100.20",
      "x-amzn-request-context": JSON.stringify({ http: { sourceIp } }),
      cookie: "session=preserved",
    });
    const result = authHeaders(incoming);
    expect(result.get("x-forwarded-for")).toBe(sourceIp);
    expect(result.get("cookie")).toBe("session=preserved");
    expect(incoming.get("x-forwarded-for")).toBe("198.51.100.10, 198.51.100.20");
  },
);

test("missing or malformed Lambda context cannot choose a new limiter via forwarded headers", () => {
  vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "oshinest-test");
  for (const context of ["", "{broken", '{"http":{"sourceIp":"invalid"}}']) {
    const result = authHeaders(new Headers({
      "x-amzn-request-context": context,
      "x-forwarded-for": "198.51.100.10",
    }));
    expect(result.get("x-forwarded-for")).toBe("127.0.0.1");
  }
});

test("local Node requests use the final forwarding hop", () => {
  vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
  const result = authHeaders(new Headers({
    "x-forwarded-for": "198.51.100.10, 127.0.0.1",
  }));
  expect(result.get("x-forwarded-for")).toBe("127.0.0.1");
});

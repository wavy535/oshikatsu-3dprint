import { afterEach, expect, test, vi } from "vitest";
import { developmentTrustedOrigins, privateNetworkOrigin } from "@/lib/auth/dev-origins";

const requestFrom = (origin: string | null) =>
  new Request("http://localhost:3100/api/auth/sign-in/email", {
    method: "POST",
    headers: origin ? { origin } : {},
  });

afterEach(() => vi.unstubAllEnvs());

test("origins inside the LAN are recognised, anything else is not", () => {
  expect(privateNetworkOrigin("http://192.168.1.68:3100")).toBe("http://192.168.1.68:3100");
  expect(privateNetworkOrigin("http://10.0.0.5:3000/works/1")).toBe("http://10.0.0.5:3000");
  expect(privateNetworkOrigin("http://172.16.0.2:3100")).toBe("http://172.16.0.2:3100");
  expect(privateNetworkOrigin("http://localhost:3100")).toBe("http://localhost:3100");
  expect(privateNetworkOrigin("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");

  expect(privateNetworkOrigin("http://172.32.0.2:3100")).toBeNull();
  expect(privateNetworkOrigin("http://192.168.example.test")).toBeNull();
  expect(privateNetworkOrigin("https://192.168.1.68")).toBeNull();
  expect(privateNetworkOrigin("http://oshinest.example.test")).toBeNull();
  expect(privateNetworkOrigin("not a url")).toBeNull();
  expect(privateNetworkOrigin(null)).toBeNull();
});

test("the LAN is trusted while developing and never in production", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(developmentTrustedOrigins(requestFrom("http://192.168.1.68:3100"))).toEqual([
    "http://192.168.1.68:3100",
  ]);
  expect(developmentTrustedOrigins(requestFrom("https://phishing.example.test"))).toEqual([]);
  expect(developmentTrustedOrigins(requestFrom(null))).toEqual([]);
  // サーバー側からセッションを読むときは、リクエストが渡らない
  expect(developmentTrustedOrigins(undefined)).toEqual([]);

  vi.stubEnv("NODE_ENV", "production");
  expect(developmentTrustedOrigins(requestFrom("http://192.168.1.68:3100"))).toEqual([]);
});

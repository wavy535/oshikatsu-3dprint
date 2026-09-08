import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { paymentMode } from "@/lib/payments/stripe";

afterEach(() => vi.unstubAllEnvs());

test.each([
  ["production", "true", "", "", "unavailable"],
  ["test", "true", "", "", "unavailable"],
  ["development", "false", "", "", "unavailable"],
  ["development", "true", "", "", "development"],
  ["production", "true", "sk_test_xxx", "", "unavailable"],
  ["production", "false", "sk_test_configured", "whsec_configured", "stripe"],
  ["development", "true", "sk_test_configured", "", "unavailable"],
])("%s / dev=%s / key=%s / webhook=%s -> %s", (env, allow, key, secret, expected) => {
  vi.stubEnv("NODE_ENV", env);
  vi.stubEnv("ALLOW_DEV_PAYMENTS", allow);
  vi.stubEnv("STRIPE_SECRET_KEY", key);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  expect(paymentMode()).toBe(expected);
});

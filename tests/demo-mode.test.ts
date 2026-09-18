import { afterEach, expect, test, vi } from "vitest";
import { demoGuestEnabled, safeGuestRedirect } from "@/lib/auth/demo-mode";
afterEach(() => vi.unstubAllEnvs());
test("guest entry is opt-in, not inferred from production or missing configuration", () => {
  vi.stubEnv("DEMO_GUEST_ENABLED", ""); expect(demoGuestEnabled()).toBe(false);
  vi.stubEnv("DEMO_GUEST_ENABLED", "false"); expect(demoGuestEnabled()).toBe(false);
  vi.stubEnv("DEMO_GUEST_ENABLED", "true"); expect(demoGuestEnabled()).toBe(true);
});
test.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\r\nevil", null])("guest redirect rejects %s", value => {
  expect(safeGuestRedirect(value)).toBe("/");
});
test("guest redirect preserves a local destination", () => expect(safeGuestRedirect("/studio/works?view=draft")).toBe("/studio/works?view=draft"));

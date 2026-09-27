import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { head } = vi.hoisted(() => ({ head: vi.fn() }));
vi.mock("@/lib/platform", () => ({ platform: () => ({ FILES: { head } }) }));
import { findArModel } from "@/lib/files/storage";
import { verifyFileClaim } from "@/lib/files/capability";
beforeEach(() => { vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-characters"); vi.stubEnv("SITE_URL", "https://example.test"); });
afterEach(() => vi.unstubAllEnvs());

test("only an exact, unexpired R2 cache object yields a signed URL", async () => {
  for (const object of [null, { uploaded: new Date(Date.now() - 6 * 86400_000) }]) {
    head.mockResolvedValue(object);
    expect(await findArModel("model.glb")).toBeNull();
  }
  head.mockResolvedValue({ uploaded: new Date() });
  const url = new URL((await findArModel("model.glb"))!);
  expect(await verifyFileClaim(url.searchParams.get("token"), "read")).toMatchObject({ key: "ar-cache/model.glb" });
  expect(head).toHaveBeenLastCalledWith("ar-cache/model.glb");
});
test("storage permission errors are not hidden as cache misses", async () => {
  head.mockRejectedValue(new Error("AccessDenied"));
  await expect(findArModel("model.glb")).rejects.toThrow("AccessDenied");
});

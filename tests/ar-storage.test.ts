import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...await original<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = send; },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://s3.example/signed") }));
import { findArModel } from "@/lib/files/s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

beforeEach(() => { vi.stubEnv("AWS_REGION", "ap-northeast-1"); vi.stubEnv("S3_BUCKET", "test"); });

test("only an exact, unexpired cache object yields a signed URL", async () => {
  for (const contents of [[], [{ Key: "ar-cache/model.glb.extra", LastModified: new Date() }],
    [{ Key: "ar-cache/model.glb", LastModified: new Date(Date.now() - 6 * 86400_000) }]]) {
    send.mockResolvedValue({ Contents: contents });
    expect(await findArModel("model.glb")).toBeNull();
  }
  expect(getSignedUrl).not.toHaveBeenCalled();
  send.mockResolvedValue({ Contents: [{ Key: "ar-cache/model.glb", LastModified: new Date() }] });
  expect(await findArModel("model.glb")).toBe("https://s3.example/signed");
  expect(send.mock.calls.at(-1)?.[0].input).toEqual({ Bucket: "test", Prefix: "ar-cache/model.glb", MaxKeys: 1 });
});

test("storage permission errors are not hidden as cache misses", async () => {
  send.mockRejectedValue(new Error("AccessDenied"));
  await expect(findArModel("model.glb")).rejects.toThrow("AccessDenied");
});

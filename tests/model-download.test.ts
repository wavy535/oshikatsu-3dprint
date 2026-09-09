import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
vi.mock("server-only", () => ({}));
import { readModel } from "@/lib/files/s3";
import { MODEL_LIMITS } from "@/lib/print/limits";

beforeEach(() => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("S3_BUCKET", "local-fixture");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function response(chunks: number[], declaredSize: number, error = false) {
  const cancel = vi.fn();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length)
        controller.enqueue(new Uint8Array(chunks[i++]).fill(65));
      else if (error) controller.error(new Error("interrupted download"));
      else controller.close();
    },
    cancel,
  });
  vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
    ContentLength: declaredSize,
    Body: { transformToWebStream: () => stream },
  } as never);
  return { cancel, stream };
}

test("model download returns all bytes across chunk boundaries", async () => {
  const { stream } = response([2, 3, 1], 6);
  expect(await readModel("owner/work/model.stl")).toEqual(
    Buffer.from("AAAAAA"),
  );
  expect(stream.locked).toBe(false);
});

test("model download rejects oversized headers before allocating the file", async () => {
  const { cancel, stream } = response([1], MODEL_LIMITS.fileBytes + 1);
  await expect(readModel("owner/work/model.stl")).rejects.toThrow(/80MiB/);
  expect(cancel).toHaveBeenCalled();
  expect(stream.locked).toBe(false);
});

test("model download cancels an actual body exceeding its declared size", async () => {
  const { cancel, stream } = response([4, 4, 4], 6);
  await expect(readModel("owner/work/model.stl")).rejects.toThrow(/申告値/);
  expect(cancel).toHaveBeenCalled();
  expect(stream.locked).toBe(false);
});

test("truncated or interrupted downloads never return a partially filled buffer", async () => {
  response([3], 6);
  await expect(readModel("owner/work/model.stl")).rejects.toThrow(/途切れ/);
  vi.restoreAllMocks();
  const { stream } = response([3], 6, true);
  await expect(readModel("owner/work/model.stl")).rejects.toThrow(
    "interrupted download",
  );
  expect(stream.locked).toBe(false);
});

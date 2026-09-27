import { expect, test } from "vitest";
import { brotliDecompressSync } from "node:zlib";
import { compressHtml } from "@/lib/render/compress-html";

test.each(["gzip, br, zstd", "br;q=0.5", "BR; Q=1"])("Brotli preserves Japanese HTML for %s", (accepted) => {
  const html = "<!doctype html><html><p>通知設定と推しぬい</p></html>";
  const compressed = compressHtml(html, accepted);
  expect(compressed).not.toBeNull();
  expect(brotliDecompressSync(compressed!).toString("utf8")).toBe(html);
});

test.each([null, "identity", "gzip", "gzip, br;q=0", "br;q=0.000", "br;q=invalid"])(
  "uses automatic encoding when Brotli is not accepted: %s", (accepted) => {
    expect(compressHtml("<p>通知設定</p>", accepted)).toBeNull();
  },
);

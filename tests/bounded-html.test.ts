import { expect, test } from "vitest";
import { readBoundedHtml } from "@/lib/render/bounded-html";

function source(parts: Uint8Array[], onCancel?: () => void) {
  let next = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < parts.length) controller.enqueue(parts[next++]);
      else controller.close();
    },
    cancel: onCancel,
  });
}

test("bounded HTML preserves Japanese characters split between chunks", async () => {
  const text = "<p>通知設定</p>";
  const bytes = new TextEncoder().encode(text);
  const body = await readBoundedHtml(source([bytes.slice(0, 5), bytes.slice(5)]), bytes.length);
  expect(body).toEqual({ html: text });
});

test("oversized documents replay the buffered prefix and remaining bytes unchanged", async () => {
  const bytes = new TextEncoder().encode("<p>大きなHTMLも欠損しない</p>");
  const body = await readBoundedHtml(source([bytes.slice(0, 8), bytes.slice(8, 18), bytes.slice(18)]), 10);
  expect("stream" in body).toBe(true);
  if ("stream" in body) expect(new Uint8Array(await new Response(body.stream).arrayBuffer())).toEqual(bytes);
});

test("canceling a streamed fallback cancels the source", async () => {
  let canceled = false;
  const body = await readBoundedHtml(source([new Uint8Array(16), new Uint8Array(16)], () => { canceled = true; }), 8);
  if (!("stream" in body)) throw new Error("Expected streaming fallback");
  await body.stream.cancel();
  expect(canceled).toBe(true);
});

test("a source error is propagated", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("source failed")); } });
  await expect(readBoundedHtml(stream, 16)).rejects.toThrow("source failed");
});

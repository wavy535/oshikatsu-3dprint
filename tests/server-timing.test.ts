import { expect, test } from "vitest";
import { createRenderTiming } from "@/lib/render/server-timing";

test("timings are request-local, preserve existing headers, and never consume the body", async () => {
  let clock = 10;
  const timing = createRenderTiming(() => clock);
  const other = createRenderTiming(() => clock);
  clock = 25;
  timing.mark("ssr");
  clock = 40;
  timing.mark("html");
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const original = new Response(body, {
    headers: {
      "server-timing": "upstream;dur=2",
      "cache-control": "private, no-store, no-transform",
      "content-encoding": "br",
      "set-cookie": "fixture=value; HttpOnly; Secure",
      "vary": "Accept-Encoding",
    },
  });
  const result = timing.finish(original);
  expect(result.body).toBe(body);
  expect(body.locked).toBe(false);
  expect(result.headers.get("server-timing")).toBe("upstream;dur=2, ssr;dur=15.0, html;dur=15.0, worker;dur=30.0");
  for (const key of ["cache-control", "content-encoding", "set-cookie", "vary"])
    expect(result.headers.get(key)).toBe(original.headers.get(key));
  expect(other.finish(new Response()).headers.get("server-timing")).toBe("worker;dur=30.0");
  const bytes = new Uint8Array([1, 2, 3]);
  controller.enqueue(bytes);
  controller.close();
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
});

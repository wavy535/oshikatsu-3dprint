/**
 * Per-request durations only: never include URLs, identity or query contents.
 * Cloudflare's production clock advances on I/O, not CPU execution. Zero is
 * not proof of free CSS/encoding work; use platform CPU metrics/profiling too.
 */
export function createRenderTiming(now: () => number = () => performance.now()) {
  const start = now();
  let previous = start;
  const entries: string[] = [];
  return {
    mark(name: "ssr" | "html" | "css" | "rewrite" | "encode") {
      const current = now();
      entries.push(`${name};dur=${Math.max(0, current - previous).toFixed(1)}`);
      previous = current;
    },
    finish(response: Response): Response {
      const headers = new Headers(response.headers);
      headers.append("server-timing", [...entries, `worker;dur=${Math.max(0, now() - start).toFixed(1)}`].join(", "));
      // Preserve the original stream, encoding, cookies and cache policy.
      // The Worker may already have encoded Brotli bytes.
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
        encodeBody: "manual",
      });
    },
  };
}

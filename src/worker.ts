import handler from "vinext/server/fetch-handler";
import { createProcessor, type CompactPlan } from "beasties/runtime";
import { readBoundedHtml } from "./lib/render/bounded-html";
import { compressHtml } from "./lib/render/compress-html";
export * from "vinext/server/fetch-handler";

declare global {
  var __OSHINEST_CSS_PLANS__: CompactPlan[] | undefined;
}

// Only immutable build data and a selector evaluator are shared. No request,
// HTML, identity or document-shape cache survives between invocations.
let processor: ReturnType<typeof createProcessor> | undefined;

export default {
  async fetch(request, env, ctx) {
    const response = await handler.fetch(request, env, ctx);
    if (
      request.method !== "GET" || response.status !== 200 || !response.body ||
      !response.headers.get("content-type")?.startsWith("text/html") ||
      !globalThis.__OSHINEST_CSS_PLANS__
    ) return response;

    const body = await readBoundedHtml(response.body, 256 * 1024);
    if ("stream" in body) return new Response(body.stream, response);
    if (!body.html.includes("data-vinext-inline-css")) return new Response(body.html, response);

    let css: string;
    try {
      processor ??= createProcessor(globalThis.__OSHINEST_CSS_PLANS__, { cache: false });
      css = processor.extract(body.html).css;
    } catch {
      // Optimizing styles must never turn a successful page into an error.
      console.warn("Critical CSS extraction failed; serving complete styles");
      return new Response(body.html, response);
    }
    if (!css) return new Response(body.html, response);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("etag");
    // The inline subset already styles the initial document. An HTTP preload
    // of the full CSS starts before HTML arrives and competes for its bandwidth.
    // Leave unrelated hints intact; React still loads full CSS for navigation.
    const hints = headers.get("link")?.split(/,(?=\s*<)/).filter((hint) => !(
      /^\s*<\/_next\/static\/css\/[^>]+>/.test(hint) &&
      /;\s*rel="?preload"?(?:;|\s*$)/.test(hint) &&
      /;\s*as="?style"?(?:;|\s*$)/.test(hint)
    ));
    if (hints?.length) headers.set("link", hints.join(","));
    else if (hints) headers.delete("link");
    // The initial DOM gets all matching rules, not a viewport approximation.
    // Keep the normal RSC stylesheet loader for new components and later routes.
    // This subset must not claim to replace the complete stylesheet in React.
    const optimized = new HTMLRewriter().on("head > style[data-vinext-inline-css]", {
      element(element) {
        element.removeAttribute("data-vinext-inline-css");
        element.removeAttribute("data-href");
        element.removeAttribute("data-precedence");
        element.setAttribute("data-oshinest-critical", "");
        element.setInnerContent(css.replace(/<\/style/gi, "<\\/style"), { html: true });
      },
    }).transform(new Response(body.html, { status: response.status, headers }));
    // This document is already bounded and buffered. Coalesce the rewrite so
    // compression can see the entire document without intermediate flushes.
    const html = await optimized.text();
    // Cloudflare normalizes Accept-Encoding before invoking the Worker. Use
    // its client capability list; quality parameters are honored when present.
    // The edge can strip q values (see the performance report's limitation).
    const accepted = typeof request.cf?.clientAcceptEncoding === "string"
      ? request.cf.clientAcceptEncoding : request.headers.get("accept-encoding");
    headers.append("vary", "Accept-Encoding");
    let compressed: Uint8Array<ArrayBuffer> | null;
    try {
      compressed = compressHtml(html, accepted);
    } catch {
      console.warn("HTML compression failed; using automatic encoding");
      return new Response(html, { status: response.status, headers });
    }
    if (!compressed) return new Response(html, { status: response.status, headers });
    headers.set("content-encoding", "br");
    // The edge otherwise decodes this body and recompresses it as Zstandard,
    // undoing the size benefit and adding another compression step.
    const cacheControl = headers.get("cache-control");
    if (!cacheControl?.split(",").some((directive) => directive.trim().toLowerCase() === "no-transform")) {
      headers.set("cache-control", cacheControl ? `${cacheControl}, no-transform` : "no-transform");
    }
    return new Response(compressed, { status: response.status, headers, encodeBody: "manual" });
  },
} satisfies ExportedHandler<CloudflareEnv>;

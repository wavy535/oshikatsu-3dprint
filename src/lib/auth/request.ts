import "server-only";
import { isIP } from "node:net";

/** Cloudflare supplies the connecting IP. Never trust a caller's X-Forwarded-For. */
export function authHeaders(incoming: Headers) {
  const headers = new Headers(incoming);
  if (process.env.APP_RUNTIME === "cloudflare") {
    const source = headers.get("cf-connecting-ip") ?? "";
    headers.set("x-forwarded-for", isIP(source) ? source : "127.0.0.1");
    return headers;
  }
  // Local Node / Next development server appends the directly connected client.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded)
    headers.set("x-forwarded-for", forwarded.split(",").at(-1)!.trim());
  return headers;
}

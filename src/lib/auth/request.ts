import "server-only";
import { isIP } from "node:net";

/** Lambda Web Adapter overwrites this context with the Function URL event.
 * Use its source IP for auth limits, ignoring caller-provided forwarding headers. */
export function authHeaders(incoming: Headers) {
  const headers = new Headers(incoming);
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    let ip = "127.0.0.1";
    try {
      const context = JSON.parse(headers.get("x-amzn-request-context") ?? "{}");
      const source = context?.http?.sourceIp;
      if (typeof source === "string" && isIP(source)) ip = source;
    } catch {
      // Missing or malformed context shares one limiter instead of trusting input.
    }
    headers.set("x-forwarded-for", ip);
    return headers;
  }
  // Local Node / Next development server appends the directly connected client.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded)
    headers.set("x-forwarded-for", forwarded.split(",").at(-1)!.trim());
  return headers;
}

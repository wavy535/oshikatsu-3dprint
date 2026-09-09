import "server-only";

/** ECS ingress is restricted to the ALB, which appends the client IP. Ignore
 * caller-provided entries before that final hop for authentication rate limits. */
export function authHeaders(incoming: Headers) {
  const headers = new Headers(incoming);
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded)
    headers.set("x-forwarded-for", forwarded.split(",").at(-1)!.trim());
  return headers;
}

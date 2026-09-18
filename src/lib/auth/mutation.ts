import "server-only";
import { cookies, headers } from "next/headers";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { getAuth } from "./config";
import { siteUrl } from "@/lib/site";
import { authHeaders } from "./request";

type AuthPath =
  | "/sign-in/anonymous"
  | "/sign-up/email"
  | "/sign-in/email"
  | "/sign-out"
  | "/email-otp/verify-email"
  | "/email-otp/send-verification-otp"
  | "/phone-number/send-otp"
  | "/phone-number/verify";

/** Use the library's HTTP pipeline even from Server Actions: its database rate
 * limits and CSRF checks run in that pipeline, not in direct auth.api calls. */
export async function authMutation(
  path: AuthPath,
  body: Record<string, unknown>,
) {
  const incoming = await headers();
  const requestHeaders = new Headers({ "content-type": "application/json" });
  for (const name of [
    "cookie",
    "origin",
    "user-agent",
    "x-forwarded-for",
    "x-amzn-request-context",
  ]) {
    const value = incoming.get(name);
    if (value) requestHeaders.set(name, value);
  }
  const response = await getAuth().handler(
    new Request(`${siteUrl()}/api/auth${path}`, {
      method: "POST",
      headers: authHeaders(requestHeaders),
      body: JSON.stringify(body),
    }),
  );
  const store = await cookies();
  for (const header of response.headers.getSetCookie()) {
    for (const [name, value] of parseSetCookieHeader(header))
      store.set(name, value.value, toCookieOptions(value));
  }
  if (response.ok) return { error: null };
  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
  };
  return {
    error: {
      status: response.status,
      code: data.code,
      message: data.message ?? "認証処理に失敗しました",
    },
  };
}

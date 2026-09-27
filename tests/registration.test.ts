import { afterAll, beforeAll, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ binding: null as unknown }));
vi.mock("@/lib/platform", () => ({
  platform: () => ({ DATABASE: state.binding }),
}));
import { localD1 } from "./helpers/d1";
import { getAuth } from "@/lib/auth/config";
import { d1Database } from "@/lib/db/d1/runtime";
import { applyForCreatorAction } from "@/lib/creator/actions";
import { creatorApplicationsEnabled } from "@/lib/auth/registration-policy";
const local = localD1();
state.binding = local.binding;
beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", "local-test-secret-with-at-least-32-characters");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("AUTH_EMAIL_VERIFICATION", "disabled");
  vi.stubEnv("CREATOR_APPLICATIONS_ENABLED", "false");
  vi.stubEnv("DEMO_GUEST_ENABLED", "false");
  vi.stubEnv("MAIL_PROVIDER", "none");
});
afterAll(() => {
  local.close();
  vi.unstubAllEnvs();
});
const post = (path: string, body: unknown, cookie?: string) =>
  getAuth().handler(
    new Request(`http://localhost:3000/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
test("unverified signup creates an ordinary member and a persistent session without delivering email", async () => {
  const response = await post("sign-up/email", {
    name: "新規会員",
    email: "member@example.test",
    password: "password123",
    emailVerified: true,
    role: "admin",
  });
  const data = (await response.json()) as {
    user: { id: string; email: string; emailVerified: boolean };
  };
  expect(response.status, JSON.stringify(data)).toBe(200);
  expect(data.user.emailVerified).toBe(false);
  const cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const session = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/get-session", {
      headers: { cookie },
    }),
  );
  expect(
    ((await session.json()) as { user: { emailVerified: boolean } }).user
      .emailVerified,
  ).toBe(false);
  const service = d1Database(local.binding, { role: "app_service" });
  expect(
    await service
      .selectFrom("profiles")
      .select("role")
      .where("id", "=", data.user.id)
      .executeTakeFirstOrThrow(),
  ).toEqual({ role: "buyer" });
  const actor = d1Database(local.binding, {
    role: "app_user",
    userId: data.user.id,
  });
  await expect(
    actor
      .updateTable("profiles")
      .set({ role: "admin" })
      .where("id", "=", data.user.id)
      .execute(),
  ).rejects.toThrow();
  await expect(
    actor
      .insertInto("creator_applications")
      .values({ user_id: data.user.id, terms_version: "2026-09-27" })
      .execute(),
  ).rejects.toThrow("email_not_verified");
  await expect(
    actor
      .insertInto("works")
      .values({ creator_id: data.user.id, title: "forged" })
      .execute(),
  ).rejects.toThrow();
  expect(creatorApplicationsEnabled()).toBe(false);
  expect(await applyForCreatorAction({ error: null }, new FormData())).toEqual({
    error: "クリエイター申請は現在準備中です",
  });
  for (const path of [
    "email-otp/send-verification-otp",
    "phone-number/send-otp",
    "phone-number/verify",
    "sign-in/anonymous",
  ]) {
    expect(
      (
        await post(
          path,
          { email: data.user.email, type: "email-verification" },
          cookie,
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  }
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ binding: null as unknown }));
vi.mock("@/lib/platform", () => ({
  platform: () => ({ DATABASE: state.binding }),
}));
import { localD1 } from "./helpers/d1";
import { getAuth } from "@/lib/auth/config";
import { d1Introspector } from "@/lib/db/d1/introspector";

let local: ReturnType<typeof localD1>;
let statements: string[];
beforeEach(() => {
  statements = [];
  local = localD1((sql) => statements.push(sql));
  state.binding = local.binding;
  vi.stubEnv("AUTH_SECRET", "local-test-secret-with-at-least-32-characters");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("AUTH_EMAIL_VERIFICATION", "disabled");
  vi.stubEnv("CREATOR_APPLICATIONS_ENABLED", "false");
  vi.stubEnv("DEMO_GUEST_ENABLED", "false");
  vi.stubEnv("MAIL_PROVIDER", "none");
});
afterEach(() => {
  local.close();
  vi.unstubAllEnvs();
});

async function signup(email: string) {
  const response = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email,
        name: email.split("@")[0],
        password: "password123",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as { user: { id: string } };
  return {
    id: data.user.id,
    headers: new Headers({
      cookie: response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    }),
  };
}

test("live schema validation uses one query and session/user use one joined read without sharing identities", async () => {
  const alice = await signup("alice@example.test");
  const bob = await signup("bob@example.test");
  for (const account of [alice, bob, alice]) {
    statements.length = 0;
    const result = await getAuth().api.getSession({ headers: account.headers });
    expect(result?.user.id).toBe(account.id);
    expect(result?.user.emailVerified).toBe(false);
    const reads = statements.filter((s) => /^select/i.test(s));
    expect(reads).toHaveLength(2);
    expect(reads[0]).toContain("pragma_table_info");
    expect(reads[1]).toContain('"visible_auth_sessions"');
    expect(reads[1]).toContain('"visible_app_users"');
  }
  // Changes are visible immediately, not hidden behind a session/user cache.
  await local.query("UPDATE app_users SET name=$1 WHERE id=$2", [
    "Updated",
    alice.id,
  ]);
  expect(
    (await getAuth().api.getSession({ headers: alice.headers }))?.user.name,
  ).toBe("Updated");
  await local.query("UPDATE auth_sessions SET expires_at=$1 WHERE user_id=$2", [
    "2000-01-01T00:00:00.000Z",
    alice.id,
  ]);
  expect(await getAuth().api.getSession({ headers: alice.headers })).toBeNull();
  expect(
    (await getAuth().api.getSession({ headers: bob.headers }))?.user.id,
  ).toBe(bob.id);
});

test("schema mismatch still stops a valid session read", async () => {
  const account = await signup("schema@example.test");
  local.sqlite.exec(
    "ALTER TABLE app_users RENAME COLUMN email_verified TO unexpected_column",
  );
  await expect(
    getAuth().api.getSession({ headers: account.headers }),
  ).rejects.toThrow();
});

test("schema introspection preserves metadata and refuses guest or reserved table access", async () => {
  const metadata = await d1Introspector(
    local.binding,
    { role: "app_service" },
    ["app_users", "auth_sessions"],
  ).getTables();
  expect(metadata.map((t) => t.name)).toEqual(["app_users", "auth_sessions"]);
  expect(metadata[0].columns).toContainEqual(
    expect.objectContaining({
      name: "email",
      dataType: "TEXT",
      isNullable: false,
    }),
  );
  await expect(
    d1Introspector(local.binding, { role: "app_guest" }).getTables(),
  ).rejects.toThrow("permission denied");
  await expect(
    d1Introspector(local.binding, { role: "app_service" }, [
      "_cf_KV",
    ]).getTables(),
  ).rejects.toThrow("Unregistered");
});

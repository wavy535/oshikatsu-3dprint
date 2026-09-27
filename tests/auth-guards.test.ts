import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  getSession: vi.fn(),
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("@/lib/auth/config", () => ({
  getAuth: () => ({ api: { getSession: state.getSession } }),
}));
vi.mock("@/lib/db/client", () => ({ database: state.database }));
import { getOptionalUser, requireUser } from "@/lib/auth/guards";

beforeEach(() => {
  state.headers = new Headers();
  state.getSession.mockReset();
  state.database.mockReset();
});

test.each([undefined, "preferences=compact", "better-auth.session_token="])(
  "anonymous reads do not initialize authentication: %s",
  async (cookie) => {
    if (cookie) state.headers.set("cookie", cookie);
    expect((await getOptionalUser()).user).toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
    expect(state.database).toHaveBeenCalledWith();
  },
);

test.each(["better-auth.session_token", "__Secure-better-auth.session_token"])(
  "%s always requires server validation and uses only the verified identity",
  async (name) => {
    state.headers.set("cookie", `${name}=supplied-token`);
    state.getSession.mockResolvedValue({ user: { id: "verified-member" } });
    expect((await getOptionalUser()).user?.id).toBe("verified-member");
    expect(state.getSession).toHaveBeenCalledWith({ headers: state.headers });
    expect(state.database).toHaveBeenCalledWith("verified-member");
  },
);

test("forged or expired cookies do not grant access to protected pages", async () => {
  state.headers.set("cookie", "__Secure-better-auth.session_token=forged");
  state.getSession.mockResolvedValue(null);
  await expect(requireUser("/mypage")).rejects.toThrow("NEXT_REDIRECT");
  expect(state.getSession).toHaveBeenCalled();
  expect(state.database).toHaveBeenCalledWith(undefined);
});

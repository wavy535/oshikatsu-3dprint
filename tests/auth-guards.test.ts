import { beforeEach, expect, test, vi } from "vitest";
// Exercise the installed vinext request lifecycle, including async continuations.
// This internal harness is test-only; application readers use vinext/cache.
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
} from "../node_modules/vinext/dist/shims/unified-request-context.js";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  getSession: vi.fn(),
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => getRequestContext().headersContext?.headers ?? state.headers,
}));
vi.mock("@/lib/auth/config", () => ({
  getAuth: () => ({ api: { getSession: state.getSession } }),
}));
vi.mock("@/lib/db/client", () => ({ database: state.database }));
import { getOptionalUser, getUserProfile, requireUser } from "@/lib/auth/guards";

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

function inRequest<T>(token: string, read: () => Promise<T>) {
  const headers = new Headers({ cookie: `better-auth.session_token=${token}` });
  return runWithRequestContext(
    createRequestContext({ headersContext: { headers, cookies: new Map() } }),
    read,
  );
}

test("concurrent and sequential readers share validation and profile within one request", async () => {
  state.getSession.mockResolvedValue({ user: { id: "member-a" } });
  const profile = { role: "buyer", display_name: "A", avatar_url: null };
  const executeTakeFirst = vi.fn().mockResolvedValue(profile);
  const query = {
    select: () => query,
    where: () => query,
    executeTakeFirst,
  };
  state.database.mockReturnValue({ selectFrom: () => query });
  await inRequest("a", async () => {
    const [first, second] = await Promise.all([getUserProfile(), getUserProfile()]);
    await Promise.resolve();
    const third = await getUserProfile();
    expect(first.profile).toEqual(profile);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect((await requireUser()).user.id).toBe("member-a");
  });
  expect(state.getSession).toHaveBeenCalledTimes(1);
  expect(executeTakeFirst).toHaveBeenCalledTimes(1);
});

test("overlapping requests never share identities", async () => {
  state.getSession.mockImplementation(async ({ headers }: { headers: Headers }) => {
    await Promise.resolve();
    return { user: { id: headers.get("cookie")!.split("=")[1] } };
  });
  const read = async () => {
    const first = await getOptionalUser();
    await Promise.resolve();
    expect(await getOptionalUser()).toBe(first);
    return first.user?.id;
  };
  expect(await Promise.all([inRequest("a", read), inRequest("b", read)]))
    .toEqual(["a", "b"]);
  expect(state.getSession).toHaveBeenCalledTimes(2);
});

test("the next request revalidates the same cookie after session revocation", async () => {
  state.getSession.mockResolvedValueOnce({ user: { id: "member-a" } })
    .mockResolvedValueOnce(null);
  expect((await inRequest("a", getOptionalUser)).user?.id).toBe("member-a");
  await expect(inRequest("a", () => requireUser())).rejects.toThrow("NEXT_REDIRECT");
  expect(state.getSession).toHaveBeenCalledTimes(2);
});

test("failed validation is not reused on retry", async () => {
  state.getSession.mockRejectedValueOnce(new Error("D1 unavailable"))
    .mockResolvedValueOnce({ user: { id: "member-a" } });
  await inRequest("a", async () => {
    await expect(getOptionalUser()).rejects.toThrow("D1 unavailable");
    expect((await getOptionalUser()).user?.id).toBe("member-a");
  });
  expect(state.getSession).toHaveBeenCalledTimes(2);
});

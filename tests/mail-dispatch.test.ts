import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/mail/send", () => ({ mailProvider: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://oshinest.example" }));
vi.mock("@/lib/notifications/queries", () => ({ KIND_LABEL: { announcement: "お知らせ" } }));
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mailProvider, sendMail } from "@/lib/mail/send";
import { dispatchNotificationEmails } from "@/lib/mail/dispatch";
const rpc = vi.fn();
const update = vi.fn();
const select = vi.fn();
beforeEach(() => {
  vi.mocked(mailProvider).mockReturnValue("mailpit");
  vi.mocked(sendMail).mockResolvedValue({ ok: true, provider: "mailpit" });
  rpc.mockResolvedValue({ error: null, data: [{ id: "notification", user_id: "buyer", email: "buyer@example.invalid", digest: "instant", kind: "announcement", title: "通知", body: "本文", link_path: "/mypage/notifications", created_at: "2026-09-08T00:00:00Z" }] });
  select.mockResolvedValue({ data: [{ id: "notification" }], error: null });
  const chain = { in: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select, then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve) };
  update.mockReturnValue(chain);
  vi.mocked(createServiceRoleClient).mockReturnValue({ rpc, from: () => ({ update }) } as unknown as ReturnType<typeof createServiceRoleClient>);
});
test("配信先が未設定なら通知を確保しない", async () => {
  vi.mocked(mailProvider).mockReturnValue("none");
  expect((await dispatchNotificationEmails()).errors).not.toHaveLength(0);
  expect(rpc).not.toHaveBeenCalled();
});
test("送信が成功してから配信済みにする", async () => {
  vi.mocked(sendMail).mockImplementationOnce(async () => {
    expect(update).not.toHaveBeenCalled();
    return { ok: true, provider: "mailpit" };
  });
  expect(await dispatchNotificationEmails()).toMatchObject({ sent: 1, notified: 1, failed: 0, errors: [] });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ emailed_at: expect.any(String) }));
});
test("送信失敗は配信済みにせず確保を解放する", async () => {
  vi.mocked(sendMail).mockResolvedValueOnce({ ok: false, provider: "mailpit", error: "unavailable" });
  expect(await dispatchNotificationEmails()).toMatchObject({ sent: 0, notified: 0, failed: 1 });
  expect(update).toHaveBeenCalledExactlyOnceWith({ email_claim_token: null, email_claimed_until: null });
});
test("送信後のDB失敗を正常終了として報告しない", async () => {
  select.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
  const result = await dispatchNotificationEmails();
  expect(result.sent).toBe(1);
  expect(result.notified).toBe(0);
  expect(result.errors).toEqual(["acknowledge: database unavailable"]);
});

import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ serviceDatabase: vi.fn() }));
vi.mock("@/lib/mail/send", () => ({ mailProvider: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://oshinest.example" }));
vi.mock("@/lib/notifications/labels", () => ({ KIND_LABEL: { announcement: "お知らせ" } }));
vi.mock("@/lib/db/functions", () => ({ call: vi.fn() }));
import { call } from "@/lib/db/functions";
import { mockDatabase } from "./helpers/database";
import { serviceDatabase } from "@/lib/db/client";
import { mailProvider, sendMail } from "@/lib/mail/send";
import { dispatchNotificationEmails } from "@/lib/mail/dispatch";
const { db, query } = mockDatabase();
const rpc = vi.mocked(call);
const update = vi.fn();
beforeEach(() => {
  vi.mocked(mailProvider).mockReturnValue("mailpit");
  vi.mocked(sendMail).mockResolvedValue({ ok: true, provider: "mailpit" });
  rpc.mockResolvedValue({ error: null, data: [{ id: "notification", user_id: "buyer", email: "buyer@example.invalid", digest: "instant", digest_hour: 20, kind: "announcement", title: "通知", body: "本文", link_path: "/mypage/notifications", created_at: "2026-09-08T00:00:00Z" }] });
  query.mockImplementation(async (sql, parameters) => {
    update(sql, parameters);
    return { rows: sql.includes("returning") ? [{ id: "notification" }] : [] };
  });
  vi.mocked(serviceDatabase).mockReturnValue(db);
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
  expect(update).toHaveBeenCalledWith(expect.stringContaining('"emailed_at" = $1'), expect.arrayContaining([["notification"]]));
});
test("送信失敗は配信済みにせず確保を解放する", async () => {
  vi.mocked(sendMail).mockResolvedValueOnce({ ok: false, provider: "mailpit", error: "unavailable" });
  expect(await dispatchNotificationEmails()).toMatchObject({ sent: 0, notified: 0, failed: 1 });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][0]).not.toContain("emailed_at");
});
test("送信後のDB失敗を正常終了として報告しない", async () => {
  query.mockRejectedValueOnce(new Error("database unavailable"));
  const result = await dispatchNotificationEmails();
  expect(result.sent).toBe(1);
  expect(result.notified).toBe(0);
  expect(result.errors).toEqual(["acknowledge: database unavailable"]);
});

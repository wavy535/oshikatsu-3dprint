import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mailProvider, sendMail } from "@/lib/mail/send";
const mail = { to: "buyer@example.invalid", subject: "発送のお知らせ", text: "発送しました", html: "<p>発送しました</p>" };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("MAIL_PROVIDER", "resend"); vi.stubEnv("RESEND_API_KEY", "test-token");
  vi.stubEnv("MAIL_FROM", "OshiNest <sender@example.invalid>");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test("未設定なら外部送信しない", async () => {
  vi.stubEnv("MAIL_PROVIDER", ""); expect(mailProvider()).toBe("none");
  expect((await sendMail(mail)).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
});
test("Resendの鍵と差出人が必要", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await sendMail(mail)).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
});
test("Resendへ本文を送る", async () => {
  expect(await sendMail(mail)).toEqual({ ok: true, provider: "resend" });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: [mail.to], text: mail.text, html: mail.html });
});
test("配信拒否や通信障害を成功と扱わず自動再送しない", async () => {
  fetchMock.mockResolvedValueOnce(new Response("rejected", { status: 429 }));
  expect(await sendMail(mail)).toMatchObject({ ok: false, provider: "resend" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockRejectedValueOnce(new Error("timeout"));
  expect((await sendMail(mail)).ok).toBe(false);
});
test("ローカル配信は指定したMailpitだけに送る", async () => {
  vi.stubEnv("MAIL_PROVIDER", "mailpit"); vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:58025/");
  expect(await sendMail(mail)).toEqual({ ok: true, provider: "mailpit" });
  expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:58025/api/v1/send");
});

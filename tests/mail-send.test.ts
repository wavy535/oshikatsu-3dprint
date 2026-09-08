import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { send, destroy } = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class { send = send; destroy = destroy; },
  SendEmailCommand: class { constructor(public input: unknown) {} },
}));
import { mailProvider, sendMail } from "@/lib/mail/send";
const mail = { to: "buyer@example.invalid", subject: "発送のお知らせ", text: "発送しました", html: "<p>発送しました</p>" };
beforeEach(() => {
  vi.stubEnv("MAIL_PROVIDER", "ses");
  vi.stubEnv("AWS_REGION", "ap-northeast-1");
  vi.stubEnv("MAIL_FROM", "OshiNest <sender@example.invalid>");
  send.mockResolvedValue({ MessageId: "test" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test("未設定なら外部送信しない", async () => {
  vi.stubEnv("MAIL_PROVIDER", "");
  expect(mailProvider()).toBe("none");
  expect((await sendMail(mail)).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
test("SESのリージョンと差出人が必要", async () => {
  vi.stubEnv("AWS_REGION", "");
  expect((await sendMail(mail)).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
test("SESへUTF-8の本文を送り、成功後は接続を閉じる", async () => {
  expect(await sendMail(mail)).toEqual({ ok: true, provider: "ses" });
  expect(send.mock.calls[0][0].input).toMatchObject({
    FromEmailAddress: "OshiNest <sender@example.invalid>", Destination: { ToAddresses: [mail.to] },
    Content: { Simple: { Subject: { Data: mail.subject, Charset: "UTF-8" }, Body: { Text: { Data: mail.text }, Html: { Data: mail.html } } } },
  });
  expect(destroy).toHaveBeenCalledOnce();
});
test("SES拒否を成功として扱わず、失敗時も接続を閉じる", async () => {
  send.mockRejectedValueOnce(new Error("MessageRejected"));
  expect(await sendMail(mail)).toEqual({ ok: false, provider: "ses", error: "MessageRejected" });
  expect(destroy).toHaveBeenCalledOnce();
});
test("ローカル配信は指定したMailpitだけに送る", async () => {
  vi.stubEnv("MAIL_PROVIDER", "mailpit");
  vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:54424/");
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  expect(await sendMail(mail)).toEqual({ ok: true, provider: "mailpit" });
  expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:54424/api/v1/send");
  expect(send).not.toHaveBeenCalled();
});

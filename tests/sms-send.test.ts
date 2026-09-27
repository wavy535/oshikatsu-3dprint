import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mail/send", () => ({ sendMail: vi.fn().mockResolvedValue({ ok: true }) }));
import { sendPhoneOtp } from "@/lib/auth/sms";
import { sendMail } from "@/lib/mail/send";
const request = vi.fn();
beforeEach(() => {
  vi.stubEnv("SMS_PROVIDER", "twilio");
  vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
  vi.stubEnv("TWILIO_API_KEY_SID", `SK${"b".repeat(32)}`);
  vi.stubEnv("TWILIO_API_KEY_SECRET", "fixture-secret");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", `MG${"c".repeat(32)}`);
  vi.stubGlobal("fetch", request);
  request.mockResolvedValue(new Response("{}", { status: 201 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
test("sends the OTP using API-key authentication and the configured messaging service", async () => {
  await sendPhoneOtp("+819000000000", "123456");
  const [url, init] = request.mock.calls[0];
  expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/AC${"a".repeat(32)}/Messages.json`);
  expect(atob(init.headers.Authorization.slice(6))).toBe(`SK${"b".repeat(32)}:fixture-secret`);
  expect(init.body.get("To")).toBe("+819000000000");
  expect(init.body.get("MessagingServiceSid")).toBe(`MG${"c".repeat(32)}`);
  expect(init.body.get("Body")).toContain("123456");
});
test("missing configuration and malformed account IDs never send a request", async () => {
  vi.stubEnv("SMS_PROVIDER", "none");
  await expect(sendPhoneOtp("+819000000000", "123456")).rejects.toThrow();
  vi.stubEnv("SMS_PROVIDER", "twilio");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "../other-account");
  await expect(sendPhoneOtp("+819000000000", "123456")).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
test("an uncertain or rejected delivery is not automatically resent", async () => {
  request.mockRejectedValueOnce(new Error("timeout"));
  await expect(sendPhoneOtp("+819000000000", "123456")).rejects.toThrow("timeout");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(sendPhoneOtp("+819000000000", "123456")).rejects.toThrow("429");
  expect(request).toHaveBeenCalledTimes(2);
});
test("Mailpit SMS is restricted to development", async () => {
  vi.stubEnv("SMS_PROVIDER", "mailpit"); vi.stubEnv("MAIL_PROVIDER", "mailpit");
  vi.stubEnv("NODE_ENV", "production");
  await expect(sendPhoneOtp("+819000000000", "123456")).rejects.toThrow();
  expect(sendMail).not.toHaveBeenCalled();
  vi.stubEnv("NODE_ENV", "development");
  await sendPhoneOtp("+819000000000", "123456");
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
});

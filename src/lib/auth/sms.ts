import "server-only";
import { sendMail } from "@/lib/mail/send";

export async function sendPhoneOtp(phone: string, code: string) {
  if (
    process.env.SMS_PROVIDER === "mailpit" &&
    process.env.NODE_ENV !== "production" &&
    process.env.MAIL_PROVIDER === "mailpit"
  ) {
    const result = await sendMail({
      to: "sms@oshinest.local",
      subject: `SMS ${phone}`,
      text: `OshiNest 確認コード: ${code}`,
    });
    if (!result.ok) throw new Error("開発用SMSを保存できませんでした");
    return;
  }
  const account = process.env.TWILIO_ACCOUNT_SID?.trim();
  const key = process.env.TWILIO_API_KEY_SID?.trim();
  const secret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (process.env.SMS_PROVIDER !== "twilio" || !account || !key || !secret || !service)
    throw new Error("Twilio SMS credentials and messaging service are required");
  if (!/^AC[0-9a-f]{32}$/i.test(account)) throw new Error("Invalid Twilio account SID");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: phone, MessagingServiceSid: service, Body: `OshiNest 確認コード: ${code}（10分間有効）` }),
    signal: AbortSignal.timeout(5_000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`SMS delivery failed (${response.status})`);
}

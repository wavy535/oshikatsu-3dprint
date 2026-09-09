import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export type Mail = { to: string; subject: string; text: string; html?: string };
export type MailProvider = "ses" | "mailpit" | "none";
export type SendResult =
  | { ok: true; provider: Exclude<MailProvider, "none"> }
  | { ok: false; provider: MailProvider; error: string };

/** 配信先は明示する。未設定のAWS環境で外部送信やローカルへの接続を始めない。 */
export function mailProvider(): MailProvider {
  const provider = process.env.MAIL_PROVIDER;
  return provider === "ses" || provider === "mailpit" ? provider : "none";
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const provider = mailProvider();
  const from = process.env.MAIL_FROM?.trim();
  if (provider === "none")
    return { ok: false, provider, error: "MAIL_PROVIDER is not configured" };

  try {
    if (provider === "ses") {
      const region = process.env.AWS_REGION?.trim();
      if (!region || !from)
        return {
          ok: false,
          provider,
          error: "AWS_REGION and MAIL_FROM are required for SES",
        };
      // 認証はECSのタスクロールなど、SDKの標準認証経路を使う。
      // 応答喪失時の自動再送を避け、再試行は通知の配信処理へ戻す。
      const ses = new SESv2Client({ region, maxAttempts: 1 });
      try {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [mail.to] },
            Content: {
              Simple: {
                Subject: { Data: mail.subject, Charset: "UTF-8" },
                Body: {
                  Text: { Data: mail.text, Charset: "UTF-8" },
                  ...(mail.html
                    ? { Html: { Data: mail.html, Charset: "UTF-8" } }
                    : {}),
                },
              },
            },
          }),
          { abortSignal: AbortSignal.timeout(5_000) },
        );
      } finally {
        ses.destroy();
      }
      return { ok: true, provider };
    }

    const url = process.env.MAILPIT_URL?.trim();
    if (!url) return { ok: false, provider, error: "MAILPIT_URL is required" };
    const sender = from || "OshiNest <no-reply@oshinest.local>";
    const match = sender.match(/^(.*?)\s*<([^>]+)>$/);
    const res = await fetch(`${url.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        From: match
          ? { Name: match[1].trim(), Email: match[2] }
          : { Email: sender },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        Text: mail.text,
        HTML: mail.html,
      }),
    });
    if (!res.ok)
      return { ok: false, provider, error: `Mailpit returned ${res.status}` };
    return { ok: true, provider };
  } catch (error) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : "Email delivery failed",
    };
  }
}

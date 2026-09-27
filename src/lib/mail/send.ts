import "server-only";

export type Mail = { to: string; subject: string; text: string; html?: string };
export type MailProvider = "resend" | "mailpit" | "none";
export type SendResult =
  | { ok: true; provider: Exclude<MailProvider, "none"> }
  | { ok: false; provider: MailProvider; error: string };

/** 配信先は明示する。未設定の環境で外部送信やローカルへの接続を始めない。 */
export function mailProvider(): MailProvider {
  const provider = process.env.MAIL_PROVIDER;
  return provider === "resend" || provider === "mailpit" ? provider : "none";
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const provider = mailProvider();
  const from = process.env.MAIL_FROM?.trim();
  if (provider === "none")
    return { ok: false, provider, error: "MAIL_PROVIDER is not configured" };

  try {
    if (provider === "resend") {
      const token = process.env.RESEND_API_KEY?.trim();
      if (!token || !from)
        return { ok: false, provider, error: "RESEND_API_KEY and MAIL_FROM are required" };
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) }),
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      return response.ok ? { ok: true, provider } : { ok: false, provider, error: `Resend returned ${response.status}` };
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

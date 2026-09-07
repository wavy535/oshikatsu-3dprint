import "server-only";

/**
 * メールの送信口。プロバイダはここだけが知っている。
 *
 *   RESEND_API_KEY があれば Resend（HTTP API。SDK は入れない）。
 *   無ければ、開発中は Supabase ローカルの Mailpit（54424）へ投げる。
 *   本番でキーが無ければ送らずに失敗を返す（呼び出し側が emailed_at を立てないので、
 *   キーを入れたあとの実行で拾い直される）。
 */
export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendResult =
  | { ok: true; provider: "resend" | "mailpit" }
  | { ok: false; provider: "resend" | "mailpit" | "none"; error: string };

const FROM_DEFAULT = "OshiNest <no-reply@oshinest.local>";

export function mailFrom() {
  return process.env.MAIL_FROM?.trim() || FROM_DEFAULT;
}

function resendKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  return key && !key.startsWith("re_xxx") ? key : null;
}

function mailpitUrl() {
  // 本番で誤って Mailpit に送らないよう、明示指定か開発時だけ
  const explicit = process.env.MAILPIT_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:54424";
}

export function mailProvider(): "resend" | "mailpit" | "none" {
  if (resendKey()) return "resend";
  if (mailpitUrl()) return "mailpit";
  return "none";
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const key = resendKey();
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: mailFrom(),
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
      });
      if (!res.ok) return { ok: false, provider: "resend", error: `${res.status} ${await res.text()}` };
      return { ok: true, provider: "resend" };
    } catch (e) {
      return { ok: false, provider: "resend", error: (e as Error).message };
    }
  }

  const mp = mailpitUrl();
  if (mp) {
    // Mailpit の Send API。From は "Name <addr>" 形式を分解して渡す
    const m = mailFrom().match(/^(.*?)\s*<([^>]+)>$/);
    const from = m ? { Name: m[1].trim(), Email: m[2] } : { Email: mailFrom() };
    try {
      const res = await fetch(`${mp}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: from,
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          Text: mail.text,
          HTML: mail.html,
        }),
      });
      if (!res.ok) return { ok: false, provider: "mailpit", error: `${res.status} ${await res.text()}` };
      return { ok: true, provider: "mailpit" };
    } catch (e) {
      return { ok: false, provider: "mailpit", error: (e as Error).message };
    }
  }

  return { ok: false, provider: "none", error: "mail provider is not configured (RESEND_API_KEY)" };
}

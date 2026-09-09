import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import { sql } from "kysely";
import "server-only";
import { randomUUID } from "node:crypto";

import { serviceDatabase } from "@/lib/db/client";
import { siteUrl } from "@/lib/site";
import { KIND_LABEL } from "@/lib/notifications/labels";
import { mailProvider, sendMail } from "@/lib/mail/send";
import type { FunctionReturns } from "@/types/db";

type Target = FunctionReturns<"notification_email_targets">[number];

export type DispatchSummary = {
  provider: ReturnType<typeof mailProvider>;
  /** 送ったメールの通数 */
  sent: number;
  /** メールにした通知の件数（まとめ受信は 1 通に複数件） */
  notified: number;
  /** 送信に失敗した通知の件数（emailed_at は立てない。次回また拾う） */
  failed: number;
  errors: string[];
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/** 1通のメール本文。1件でも複数件でも同じ形（件名だけ変える）。 */
function buildMail(items: Target[]) {
  const base = siteUrl();
  const settingsUrl = `${base}/mypage/notification-settings`;
  const single = items.length === 1;
  const subject = single
    ? `【OshiNest】${items[0].title}`
    : `【OshiNest】新しい通知が ${items.length} 件あります`;

  const textLines = items.flatMap((n) => [
    `■ ${n.title}（${KIND_LABEL[n.kind]} ／ ${fmtDate(n.created_at)}）`,
    ...(n.body ? [n.body] : []),
    `${base}${n.link_path}`,
    "",
  ]);
  const text = [
    ...textLines,
    "――――――――――――――――――――",
    "このメールは OshiNest の通知設定にもとづいて送っています。",
    `受け取り方の変更: ${settingsUrl}`,
  ].join("\n");

  const htmlItems = items
    .map(
      (n) => `
      <div style="padding:12px 0;border-bottom:1px solid #eee">
        <div style="font-size:11px;color:#888">${escapeHtml(KIND_LABEL[n.kind])} ／ ${fmtDate(n.created_at)}</div>
        <div style="font-size:15px;font-weight:600;margin:4px 0">${escapeHtml(n.title)}</div>
        ${n.body ? `<div style="font-size:13px;color:#444">${escapeHtml(n.body)}</div>` : ""}
        <div style="margin-top:8px"><a href="${base}${escapeHtml(n.link_path)}" style="font-size:13px;color:#e0567a">OshiNest で開く →</a></div>
      </div>`,
    )
    .join("");
  const html = `
    <div style="font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#222">
      <div style="font-size:18px;font-weight:700;color:#e0567a">OshiNest</div>
      ${htmlItems}
      <p style="font-size:11px;color:#888;margin-top:16px">
        このメールは OshiNest の通知設定にもとづいて送っています。<br>
        <a href="${settingsUrl}" style="color:#888">受け取り方を変更する</a>
      </p>
    </div>`;

  return { subject, text, html };
}

/**
 * DBで送信時刻と宛先を解決し、期限付きで確保してから配信する。
 * 通常の同時実行は重複を避ける。送信成功後のDB書き込み失敗時は再送され得る。
 */
export async function dispatchNotificationEmails(): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    provider: mailProvider(),
    sent: 0,
    notified: 0,
    failed: 0,
    errors: [],
  };
  if (summary.provider === "none") {
    summary.errors.push("MAIL_PROVIDER is not configured");
    return summary;
  }
  const service = serviceDatabase();
  const token = randomUUID();
  const deadline = Date.now() + 45_000;
  const { data: targets, error } = await call(
    service,
    "claim_notification_emails",
    {
      p_claim_token: token,
      p_limit: 20,
    },
  );
  if (error) {
    summary.errors.push(`claim: ${error.message}`);
    return summary;
  }
  if (!targets?.length) return summary;

  const batches: Target[][] = [];
  const dailyByUser = new Map<string, Target[]>();
  for (const target of targets) {
    if (target.digest === "daily") {
      const batch = dailyByUser.get(target.user_id) ?? [];
      batch.push(target);
      dailyByUser.set(target.user_id, batch);
    } else {
      batches.push([target]);
    }
  }
  batches.push(...dailyByUser.values());

  try {
    for (const items of batches) {
      if (Date.now() >= deadline) break;
      const result = await sendMail({
        to: items[0].email,
        ...buildMail(items),
      });
      if (!result.ok) {
        summary.failed += items.length;
        summary.errors.push(`${items[0].id}: ${result.error}`);
        continue;
      }
      summary.sent += 1;
      const { data: saved, error: saveError } = await queryResult(
        service
          .updateTable("notifications")
          .set({
            emailed_at: new Date().toISOString(),
            email_claim_token: null,
            email_claimed_until: null,
          })
          .where(
            sql<boolean>`${sql.ref("notifications.id")} = any(${items.map((item) => item.id)})`,
          )
          .where("notifications.email_claim_token", "=", token)
          .returning(["id"])
          .execute(),
      );
      if (saveError || saved?.length !== items.length) {
        summary.errors.push(
          `acknowledge: ${saveError?.message ?? "claim no longer belongs to this worker"}`,
        );
      } else {
        summary.notified += items.length;
      }
    }
  } finally {
    // 未送信・失敗分を次の実行へ返す。ここで落ちてもDBの確保期限が切れれば回復する。
    const { error: releaseError } = await queryResult(
      service
        .updateTable("notifications")
        .set({ email_claim_token: null, email_claimed_until: null })
        .where("notifications.email_claim_token", "=", token)
        .execute(),
    );
    if (releaseError) summary.errors.push(`release: ${releaseError.message}`);
  }
  return summary;
}

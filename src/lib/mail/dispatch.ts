import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { KIND_LABEL } from "@/lib/notifications/queries";
import { mailProvider, sendMail } from "@/lib/mail/send";
import type { FunctionReturns } from "@/types/db";

type Target = FunctionReturns<"notification_email_targets">[number];

export type DispatchSummary = {
  provider: ReturnType<typeof mailProvider>;
  /** 送ったメールの通数 */
  sent: number;
  /** メールにした通知の件数（まとめ受信は 1 通に複数件） */
  notified: number;
  /** まとめ受信の時刻でないため今回は送らなかった件数 */
  deferred: number;
  /** 送信に失敗した通知の件数（emailed_at は立てない。次回また拾う） */
  failed: number;
  errors: string[];
};

/** いまの JST の時（0〜23）。まとめ受信の digest_hour と比べる。 */
function jstHour(now: Date) {
  // ja-JP だと "4時" のような文字列になるので、parts から数字だけ取る
  const part = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Tokyo" })
    .formatToParts(now)
    .find((p) => p.type === "hour");
  return Number(part?.value ?? 0) % 24;
}

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
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
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
      </div>`
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
 * 「まだメールにしていない通知」をメールにする。cron から定期的に呼ぶ想定。
 *
 *   - 対象は DB の関数 notification_email_targets()（宛先・受け取り方の解決は DB 側）
 *   - 即時（instant）の人は通知ごとに 1 通
 *   - まとめ受信（daily）の人は、いまが digest_hour の時間帯のときだけ 1 通にまとめる
 *   - 送れたものだけ emailed_at を立てる。失敗したものは次回また拾う
 *
 * 冪等: 同じ通知を二重に送らないよう、送信のたびに emailed_at を更新した行数を見る。
 */
export async function dispatchNotificationEmails(now = new Date()): Promise<DispatchSummary> {
  const service = createServiceRoleClient();
  const summary: DispatchSummary = {
    provider: mailProvider(),
    sent: 0,
    notified: 0,
    deferred: 0,
    failed: 0,
    errors: [],
  };

  const { data: targets, error } = await service.rpc("notification_email_targets", { p_limit: 200 });
  if (error) {
    summary.errors.push(`targets: ${error.message}`);
    return summary;
  }
  if (!targets || targets.length === 0) return summary;

  // 宛先ごとに束ねる（instant は 1 件ずつ、daily は全部まとめて 1 通）
  const hour = jstHour(now);
  const batches: Target[][] = [];
  const dailyByUser = new Map<string, Target[]>();
  for (const t of targets) {
    if (t.digest === "daily") {
      if (t.digest_hour !== hour) {
        summary.deferred += 1;
        continue;
      }
      const list = dailyByUser.get(t.user_id) ?? [];
      list.push(t);
      dailyByUser.set(t.user_id, list);
    } else {
      batches.push([t]);
    }
  }
  batches.push(...dailyByUser.values());

  for (const items of batches) {
    const ids = items.map((n) => n.id);

    // 先に emailed_at を立てて「自分が送る」印にする（同時実行で二重送信しない）
    const { data: claimed, error: claimError } = await service
      .from("notifications")
      .update({ emailed_at: now.toISOString() })
      .in("id", ids)
      .is("emailed_at", null)
      .select("id");
    if (claimError || !claimed || claimed.length === 0) {
      if (claimError) summary.errors.push(`claim: ${claimError.message}`);
      continue;
    }
    const claimedIds = new Set(claimed.map((r) => r.id));
    const toSend = items.filter((n) => claimedIds.has(n.id));

    const mail = buildMail(toSend);
    const result = await sendMail({ to: toSend[0].email, ...mail });
    if (result.ok) {
      summary.sent += 1;
      summary.notified += toSend.length;
    } else {
      // 送れなかった印を戻す。次回の実行で拾い直される
      summary.failed += toSend.length;
      summary.errors.push(`${toSend[0].email}: ${result.error}`);
      await service
        .from("notifications")
        .update({ emailed_at: null })
        .in("id", [...claimedIds])
        .select("id");
      if (result.provider === "none") break; // 設定が無いなら残りも全部同じ
    }
  }

  return summary;
}

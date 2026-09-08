import { NextResponse } from "next/server";

import { dispatchNotificationEmails } from "@/lib/mail/dispatch";

/**
 * 通知をメールにする cron の入口。定期的に叩く（5〜10分おきが目安）。
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dispatch-emails
 *
 * DBのpg_cron + pg_netから呼ぶ。EventBridge API Destinationの5秒制限には収まらない。
 * CRON_SECRET が未設定なら 503 を返して何もしない（開けっ放しにしない）。
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await dispatchNotificationEmails();
  return NextResponse.json(summary, { status: summary.provider === "none" ? 503 : summary.errors.length > 0 ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;

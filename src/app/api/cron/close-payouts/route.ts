import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// DESIGN.md §6.3.I / §10: 毎月1日 03:00 JST (vercel.json 上は UTC 18:00 の
// 前日指定) に前月分を締める。Vercel Cron からのみ実行される想定で
// Authorization: Bearer ${CRON_SECRET} を検証する。
function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowJst.getUTCFullYear();
  const month = nowJst.getUTCMonth(); // 0-indexed。実行日はJSTで毎月2日想定 → 前月を締める
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("close_payouts", {
    p_period_start: toDateString(periodStart),
    p_period_end: toDateString(periodEnd),
    p_transfer_fee: Number(process.env.PAYOUT_TRANSFER_FEE ?? 250),
    p_min_amount: Number(process.env.PAYOUT_MIN_AMOUNT ?? 3000),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    periodStart: toDateString(periodStart),
    periodEnd: toDateString(periodEnd),
    results: data,
  });
}

import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: `middleware.ts` は非推奨となり `proxy.ts` に名称変更された。
// 役割は同じ（Supabase Authセッションの更新と保護ルートのガード）。
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 以下を除く全リクエストパスにマッチ:
     * - _next/static, _next/image（静的アセット）
     * - favicon.ico
     * - ヘルスチェックと独自認証を持つメールcron
     * - 画像ファイル
     */
    "/((?!api/health$|api/cron/dispatch-emails$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

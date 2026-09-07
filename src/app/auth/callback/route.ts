import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// メール確認リンク／OAuthコールバックの受け口。
// Supabase AuthのリダイレクトURLに `${SITE_URL}/auth/callback` を設定してください。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") ?? "/mypage";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

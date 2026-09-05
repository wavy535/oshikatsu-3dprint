import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * セッションのリフレッシュと (admin)/(creator)/(account) セグメントの
 * 粗いガードのみを行う。細かい権限判定は各 layout.tsx の guard 関数
 * （src/lib/auth/guards.ts）で行う。DESIGN.md §8.5 準拠。
 *
 * Next.js 16 以降の命名規約により、旧 middleware.ts から proxy.ts へ
 * 移行済み（挙動は同一）。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getUser() はトークンを Auth サーバーへ検証しにいく。改竄検知のため
  // getSession() ではなくこちらを使う（DESIGN.md §8.5）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAccountRoute =
    pathname.startsWith("/mypage") || pathname.startsWith("/creator");
  const isCreatorRoute = pathname.startsWith("/studio");
  const isAdminRoute = pathname.startsWith("/admin");

  if (!user && (isAccountRoute || isCreatorRoute || isAdminRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

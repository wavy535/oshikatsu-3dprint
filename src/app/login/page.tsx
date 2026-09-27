import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/site-header";
import { demoGuestEnabled } from "@/lib/auth/demo-mode";
import { GuestEntry } from "@/components/auth/guest-entry";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { cn } from "@/lib/utils";
import { emailVerificationRequired } from "@/lib/auth/registration-policy";

export const metadata = { title: "ログイン・新規登録" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; mode?: string }>;
}) {
  const { redirect, mode } = await searchParams;
  const guestMode = demoGuestEnabled();
  const signup = mode === "signup";
  const nextPath = redirect?.startsWith("/") ? redirect : undefined;
  const qs = nextPath ? `&redirect=${encodeURIComponent(nextPath)}` : "";

  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1270px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Brand compact />
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            作品を見る
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="page-shell flex flex-1 flex-col lg:py-14"
      >
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-7">
            <h1 className="page-title">
              {guestMode
                ? "OshiNestを体験する"
                : signup
                  ? "新規会員登録"
                  : "ログイン"}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {signup
                ? "サイズの保存、お気に入り、購入履歴を利用できます。"
                : "登録したメールアドレスとパスワードを入力してください。"}
            </p>
          </div>
          <div className="border-t border-ink bg-white pt-6">
            {guestMode ? (
              <GuestEntry redirectTo={nextPath} />
            ) : (
              <>
                <nav
                  aria-label="ログイン・会員登録"
                  className="mb-7 grid grid-cols-2 border-b border-line"
                >
                  {[
                    { mode: "login", label: "ログイン", active: !signup },
                    { mode: "signup", label: "新規会員登録", active: signup },
                  ].map((item) => (
                    <Link
                      key={item.mode}
                      prefetch={false}
                      href={`/login?mode=${item.mode}${qs}`}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center justify-center border-b-2 px-2 text-center text-sm font-semibold",
                        item.active
                          ? "border-brand text-brand"
                          : "border-transparent text-muted-foreground hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                {signup ? (
                  <SignupForm verifyEmail={emailVerificationRequired()} />
                ) : (
                  <LoginForm redirectTo={nextPath} />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
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
        className="page-shell grid flex-1 items-center gap-10 lg:grid-cols-2 lg:gap-20 lg:py-14"
      >
        <div className="hidden flex-col gap-6 lg:flex">
          <p className="text-sm font-semibold text-brand">
            うちの子との暮らしを、もっと。
          </p>
          <h2 className="text-4xl font-bold leading-snug">
            お気に入りの居場所を、
            <br />
            一緒に見つけよう。
          </h2>
          <figure className="max-w-md rounded-3xl bg-brand-soft px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nui-house.svg"
              width="560"
              height="440"
              alt="ぬいぐるみと小さなおうちのイラスト"
              className="w-full"
            />
          </figure>
          <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
            {[
              "マイぬいのサイズを保存できる",
              "気になる作品をお気に入りに",
              "購入履歴やメッセージをひとつの場所で",
            ].map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="size-4 text-brand" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-7">
            <h1 className="page-title">
              {guestMode
                ? "OshiNestを体験する"
                : signup
                  ? "はじめまして。"
                  : "おかえりなさい。"}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {signup
                ? "会員登録して、うちの子の居場所をさがそう。"
                : "ログインして、ぬいとの暮らしの続きを。"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-5 sm:p-8">
            {guestMode ? (
              <GuestEntry redirectTo={nextPath} />
            ) : (
              <>
                <nav
                  aria-label="ログイン・会員登録"
                  className="mb-7 grid grid-cols-2 gap-1 rounded-xl bg-ground p-1"
                >
                  {[
                    { mode: "login", label: "ログイン", active: !signup },
                    { mode: "signup", label: "新規会員登録", active: signup },
                  ].map((item) => (
                    <Link
                      key={item.mode}
                      href={`/login?mode=${item.mode}${qs}`}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center justify-center rounded-lg px-2 text-center text-sm font-semibold",
                        item.active
                          ? "bg-white text-brand shadow-sm"
                          : "text-muted-foreground hover:text-ink",
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

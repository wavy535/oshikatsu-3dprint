import Link from "next/link";
import { MessageSquare, Package, Smile } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { cn } from "@/lib/utils";

export const metadata = { title: "ログイン・新規登録" };

const POINTS = [
  { icon: Smile, text: "推しぬいのサイズに合わせて選べる" },
  { icon: Package, text: "印刷・品質管理は運営が代行" },
  { icon: MessageSquare, text: "クリエイターへオーダーメイド相談" },
];

/**
 * Figma ⓪共通「ログイン・新規登録 46:122」。
 * 左のブランドパネル＋右の認証カード。カードはタブでフォームごと入れ替わる。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; mode?: string }>;
}) {
  const { redirect, mode } = await searchParams;
  const signup = mode === "signup";
  const nextPath = redirect?.startsWith("/") ? redirect : undefined;
  const qs = nextPath ? `&redirect=${encodeURIComponent(nextPath)}` : "";

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* 左のブランドパネル */}
      <div className="flex flex-col justify-center gap-5 bg-brand px-10 py-12 lg:w-[560px] lg:px-14">
        <Link href="/" className="text-3xl font-bold text-white">
          OshiNest
        </Link>
        <p className="text-base font-semibold text-white">
          推し活のための、3Dプリント作品マーケット
        </p>
        <div className="max-w-md text-[12.5px] leading-5 text-white/80">
          <p>クリエイターは3Dデータを出品するだけ。</p>
          <p>印刷・検品・発送は OshiNest 運営がすべて代行します。</p>
        </div>
        <ul className="flex flex-col gap-3">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <span className="flex size-7.5 items-center justify-center rounded-full bg-white/20">
                <Icon className="size-3.5 text-white" aria-hidden />
              </span>
              <span className="text-xs text-white">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 右の認証カード */}
      <div className="flex flex-1 items-center justify-center bg-ground px-6 py-12">
        <div className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-7">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-ground p-1">
            <Link
              href={`/login?mode=login${qs}`}
              className={cn(
                "rounded-md py-2 text-center text-[13px] font-semibold transition-colors",
                signup ? "text-muted-foreground hover:text-ink" : "bg-white text-ink shadow-sm"
              )}
            >
              ログイン
            </Link>
            <Link
              href={`/login?mode=signup${qs}`}
              className={cn(
                "rounded-md py-2 text-center text-[13px] font-semibold transition-colors",
                signup ? "bg-white text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
              )}
            >
              新規会員登録
            </Link>
          </div>

          {signup ? <SignupForm /> : <LoginForm redirectTo={nextPath} />}
        </div>
      </div>
    </div>
  );
}

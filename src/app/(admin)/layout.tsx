import { Suspense } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { requireAdmin } from "@/lib/auth/guards";
import { ConsoleSideNav, ConsoleTabs } from "@/components/ops/console-nav";

/**
 * Figma ⑤運営オペレーション の運営コンソール。
 *
 * 暗色なのは**ヘッダーだけ**（プロトタイプ 2079:1185「運営コンソールは暗色ヘッダー
 * ＝買う人／作る人の画面と区別する」）。本文は買う人・作る人の画面と同じ明色で、
 * 同じ部品と同じトークンをそのまま使える。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground text-ink">
      <header className="flex h-[68px] flex-none items-center gap-6 bg-console px-6">
        <div className="flex items-center gap-2">
          <Link href="/admin/print-queue" className="text-[19px] font-bold text-white">
            OshiNest
          </Link>
          <span className="rounded-full bg-[#fde68a] px-2 py-0.5 text-[10.5px] font-semibold text-console">
            運営コンソール
          </span>
        </div>

        <Suspense fallback={null}>
          <ConsoleTabs />
        </Suspense>

        <div className="ml-auto flex items-center gap-2">
          <Bell className="size-[15px] text-console-ink" aria-hidden />
          <span className="text-[11.5px] text-console-ink">
            オペ：{profile?.display_name ?? "運営"}
          </span>
          <Link
            href="/"
            className="ml-3 text-[11.5px] text-console-muted transition-colors hover:text-console-ink"
          >
            サイトへ戻る
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-5 px-6 py-4">
        <Suspense fallback={null}>
          <ConsoleSideNav />
        </Suspense>
        <main className="flex min-w-0 flex-1 flex-col gap-3">{children}</main>
      </div>
    </div>
  );
}

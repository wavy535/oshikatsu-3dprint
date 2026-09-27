import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { ConsoleSideNav, ConsoleTabs } from "@/components/ops/console-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground text-ink">
      <header className="bg-console text-console-ink">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/print-queue"
              className="text-xl font-bold text-white"
            >
              OshiNest
            </Link>
            <span className="border-l border-console-muted px-3 text-sm">
              運営
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-console-muted sm:inline">
              {profile?.display_name ?? "運営メンバー"}
            </span>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 text-sm hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden />
              サイトへ戻る
            </Link>
          </div>
        </div>
        <Suspense fallback={null}>
          <ConsoleTabs />
        </Suspense>
      </header>
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-8 px-4 py-7 sm:px-6">
        <Suspense fallback={null}>
          <ConsoleSideNav />
        </Suspense>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col gap-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

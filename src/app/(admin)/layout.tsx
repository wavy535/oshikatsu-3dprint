import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";

const NAV_ITEMS = [
  { href: "/admin/print-queue", label: "印刷キュー" },
  { href: "/admin/orders", label: "注文管理" },
  { href: "/admin/products", label: "作品審査" },
  { href: "/admin/users", label: "クリエイター審査" },
  { href: "/admin/payouts", label: "払込管理" },
  { href: "/admin/reviews", label: "レビュー管理" },
];

/**
 * Figma ④運営オペレーション の暗色コンソール。
 * 配色は globals.css の .dark（= --console 系トークン）で切り替える。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="dark flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1270px] items-center gap-5 px-6 py-3">
          <Link href="/admin/print-queue" className="text-base font-bold text-primary">
            OshiNest
          </Link>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            運営コンソール
          </span>
          <nav className="ml-auto flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            サイトへ戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-6 px-6 py-6">
        {children}
      </main>
    </div>
  );
}

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { demoGuestEnabled } from "@/lib/auth/demo-mode";
import { getShellContext } from "@/lib/layout/queries";
import { Button } from "@/components/ui/button";
import { SiteNavigation } from "./site-navigation";
import { cn } from "@/lib/utils";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="OshiNest ホーム"
      className="inline-flex shrink-0 items-center gap-2.5 rounded-lg text-2xl font-bold text-ink"
    >
      <span>
        OshiNest
        {!compact && (
          <span className="mt-0.5 hidden text-sm font-normal text-muted-foreground xl:block">
            ぬいのおうち・家具・台座
          </span>
        )}
      </span>
    </Link>
  );
}

export async function SiteHeader({ query }: { query?: string }) {
  const shell = await getShellContext();
  const guestMode = demoGuestEnabled();
  return (
    <header className="relative z-40 border-b border-line bg-white">
      {guestMode && (
        <p className="bg-brand-soft px-4 py-2 text-center text-sm text-ink">
          ゲスト体験版 · 実際の支払い・発送はありません
        </p>
      )}
      <div className="mx-auto flex min-h-16 w-full max-w-[1270px] items-center gap-4 px-4 py-3 sm:px-6 lg:gap-5">
        <Brand compact />
        <form
          action="/works"
          role="search"
          className="hidden h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-ground pl-3 lg:flex"
        >
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="おうち・家具を検索"
            aria-label="作品を検索"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="min-h-11 rounded-r-xl px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
          >
            検索
          </button>
        </form>
        <SiteNavigation cartCount={shell.cartCount} />
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {shell.user ? (
            <>
              {shell.isCreator && (
                <Link
                  prefetch={false}
                  href="/studio/works"
                  className="hidden min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold text-brand xl:inline-flex"
                >
                  作品管理
                </Link>
              )}
              <Link
                href="/mypage/notifications"
                aria-label={`通知${shell.unreadCount ? `、未読${shell.unreadCount}件` : ""}`}
                className="relative flex size-11 items-center justify-center rounded-xl text-ink hover:bg-ground"
              >
                <Bell className="size-5" aria-hidden />
                {shell.unreadCount > 0 && (
                  <span className="absolute top-2 right-2 size-2 rounded-full bg-danger" />
                )}
              </Link>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="px-2 sm:px-3"
              >
                <Link prefetch={false} href="/login">
                  {guestMode ? "体験する" : "ログイン"}
                </Link>
              </Button>
              {!guestMode && (
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link prefetch={false} href="/signup">
                    新規登録
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function CategoryBar({
  categories,
  activeSlug,
}: {
  categories: { id: string; name: string; slug: string }[];
  activeSlug?: string;
}) {
  return (
    <nav aria-label="作品カテゴリ" className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1270px] items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        {[{ id: "all", name: "すべて", slug: undefined }, ...categories].map(
          (category) => (
            <Link
              key={category.id}
              href={
                category.slug ? `/works?category=${category.slug}` : "/works"
              }
              aria-current={activeSlug === category.slug ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center rounded-sm px-4 text-sm font-medium",
                activeSlug === category.slug
                  ? "bg-brand text-white"
                  : "bg-ground text-ink hover:bg-brand-soft",
              )}
            >
              {category.name}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

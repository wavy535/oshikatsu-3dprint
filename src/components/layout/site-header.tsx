import Link from "next/link";
import { Bell, Plus, Search, ShoppingBag, ShoppingCart, Smile } from "lucide-react";
import { getShellContext } from "@/lib/layout/queries";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form
      action="/works"
      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-white px-4 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="推しぬい・作品を検索"
        aria-label="作品を検索"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="sm" className="rounded-full px-4">
        検索
      </Button>
    </form>
  );
}

function NavItem({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-ink"
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span
            className="absolute -top-1 -right-1.5 min-w-3.5 rounded-full bg-danger px-1 text-[9px] leading-3.5 font-semibold text-white"
            aria-label={`未読 ${badge} 件`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}

/**
 * サイト共通ヘッダー。Figma ⓪共通 の Top Page（未ログイン 2028:92）と
 * ログイン後 Top Page（46:362）の2パターンを同じ骨格で切り替える。
 */
export async function SiteHeader({ query }: { query?: string }) {
  const shell = await getShellContext();
  const signedIn = Boolean(shell.user);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1270px] items-center gap-5 px-6 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand">
          OshiNest
        </Link>

        <div className="hidden min-w-0 flex-1 md:flex">
          <SearchBar defaultValue={query} />
        </div>

        {signedIn ? (
          <nav className="ml-auto flex items-center gap-1">
            {shell.isCreator ? (
              <Button asChild size="sm" className="mr-1 hidden sm:inline-flex">
                {/* 下書きの作成は作品管理の Server Action で行うので、そこへ送る */}
                <Link href="/studio/works">
                  <Plus className="size-4" aria-hidden />
                  作品を投稿する
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="mr-1 hidden sm:inline-flex">
                <Link href="/creator/apply">クリエイター登録</Link>
              </Button>
            )}
            {shell.isCreator && (
              <NavItem
                href="/studio/works"
                label="マイショップ"
                icon={<ShoppingBag className="size-4.5" aria-hidden />}
              />
            )}
            <NavItem
              href="/mypage/nuis"
              label="マイぬい"
              icon={<Smile className="size-4.5" aria-hidden />}
            />
            <NavItem
              href="/mypage/notifications"
              label="通知"
              icon={<Bell className="size-4.5" aria-hidden />}
              badge={shell.unreadCount}
            />
            <NavItem
              href="/cart"
              label="カート"
              icon={<ShoppingCart className="size-4.5" aria-hidden />}
              badge={shell.cartCount}
            />
            <Link
              href="/mypage"
              className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-ink"
            >
              <Avatar
                src={shell.profile?.avatar_url}
                name={shell.profile?.display_name}
                className="size-5.5 text-[9px]"
              />
              マイページ
            </Link>
          </nav>
        ) : (
          <div className="ml-auto flex items-center gap-2.5">
            <Button asChild variant="outline" size="sm">
              <Link href="/login">ログイン</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">新規会員登録</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-line/70 px-6 pb-2 md:hidden">
        <SearchBar defaultValue={query} />
      </div>
    </header>
  );
}

/** カテゴリの横並び。Figma ⓪共通 Top / 検索結果の上部にある帯。 */
export function CategoryBar({
  categories,
  activeSlug,
}: {
  categories: { id: string; name: string; slug: string }[];
  activeSlug?: string;
}) {
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-[1270px] items-center gap-2 overflow-x-auto px-6 py-2.5">
        <Link
          href="/works"
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeSlug === undefined
              ? "bg-brand text-white"
              : "bg-ground text-muted-foreground hover:text-ink"
          )}
        >
          すべて
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/works?category=${c.slug}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeSlug === c.slug
                ? "bg-brand text-white"
                : "bg-ground text-muted-foreground hover:text-ink"
            )}
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

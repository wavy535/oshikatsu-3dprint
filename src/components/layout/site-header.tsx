import Link from "next/link";
import { Bell, Plus, Search, ShoppingBag, ShoppingCart, Smile } from "lucide-react";
import { getShellContext } from "@/features/layout/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form
      action="/products"
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
 * ログイン後 Top Page（46:362）の 2 パターンを同じ骨格で切り替える。
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
            <Button
              render={<Link href="/studio/products/new" />}
              size="sm"
              className="mr-1 hidden sm:inline-flex"
            >
              <Plus />
              作品を投稿する
            </Button>
            <NavItem
              href="/studio/products"
              label="マイショップ"
              icon={<ShoppingBag className="size-4.5" aria-hidden />}
            />
            <NavItem
              href="/mypage/nuis"
              label="マイぬい"
              icon={<Smile className="size-4.5" aria-hidden />}
            />
            <NavItem
              href="/mypage/messages"
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
              <Avatar className="size-5.5">
                {shell.profile?.avatar_url ? (
                  <AvatarImage src={shell.profile.avatar_url} alt="" />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {shell.profile?.display_name?.slice(0, 1) ?? "U"}
                </AvatarFallback>
              </Avatar>
              マイページ
            </Link>
          </nav>
        ) : (
          <div className="ml-auto flex items-center gap-2.5">
            <Button render={<Link href="/login" />} variant="outline" size="sm">
              ログイン
            </Button>
            <Button render={<Link href="/login?mode=signup" />} size="sm">
              新規会員登録
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

export function CategoryBar({
  categories,
  activeId,
}: {
  categories: { id: number; name: string }[];
  activeId?: number;
}) {
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-[1270px] items-center gap-2 overflow-x-auto px-6 py-2.5">
        <Link
          href="/products"
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeId === undefined
              ? "bg-brand text-white"
              : "bg-ground text-muted-foreground hover:text-ink"
          )}
        >
          すべて
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/products?category=${c.id}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeId === c.id
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

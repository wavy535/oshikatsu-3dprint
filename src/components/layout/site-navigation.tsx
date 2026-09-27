"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag, Smile, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/works", label: "さがす", icon: Search },
  { href: "/mypage/nuis", label: "マイぬい", icon: Smile },
  { href: "/cart", label: "カート", icon: ShoppingBag },
  { href: "/mypage", label: "マイページ", icon: UserRound },
];

export function SiteNavigation({ cartCount }: { cartCount: number }) {
  const pathname = usePathname();
  const activeHref = ITEMS.filter(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-line bg-white px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:static lg:flex lg:shrink-0 lg:gap-1 lg:border-0 lg:p-0"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          prefetch={false}
          href={href}
          aria-current={activeHref === href ? "page" : undefined}
          className={cn(
            "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 py-1 text-sm lg:flex-row lg:gap-2 lg:px-3",
            activeHref === href
              ? "border-brand font-semibold text-brand"
              : "border-transparent text-muted-foreground hover:bg-ground hover:text-ink",
          )}
        >
          <span className="relative">
            <Icon className="size-5" aria-hidden />
            {href === "/cart" && cartCount > 0 && (
              <span
                className="absolute -top-2 -right-2 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold leading-6 text-white"
                aria-label={`${cartCount}点`}
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

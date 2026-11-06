"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, UserRound, House } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/create", label: "つくる", icon: House },
  { href: "/works", label: "さがす", icon: Search },
  { href: "/mypage", label: "マイページ", icon: UserRound },
];

export function SiteNavigation() {
  const pathname = usePathname();
  const workspace = pathname === "/create";
  const activeHref = ITEMS.filter(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="メインメニュー"
      className={cn(
        "lg:static lg:ml-auto lg:flex lg:shrink-0 lg:gap-1 lg:border-0 lg:p-0",
        workspace
          ? "ml-auto flex shrink-0 gap-1"
          : "fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-line bg-white px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
      )}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          prefetch={false}
          href={href}
          aria-current={activeHref === href ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-2 py-1 text-sm lg:flex-row lg:gap-2 lg:px-3",
            activeHref === href
              ? "border-brand font-semibold text-brand"
              : "border-transparent text-muted-foreground hover:bg-ground hover:text-ink",
          )}
        >
          <span className="relative">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className={cn(workspace && "sr-only sm:not-sr-only")}>
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResponsiveSidebar } from "./responsive-sidebar";
import { cn } from "@/lib/utils";

export type NavGroup = {
  label: string;
  items: { href: string; label: string; badge?: number }[];
};

/**
 * Figma ①購入フロー「マイページ 61:235」の左サイドナビ。
 * 「アカウント」と「クリエイター」の 2 グループで、ここからクリエイター管理へ入る。
 */
export function SideNav({
  groups,
  footer,
  label = "マイページメニュー",
}: {
  groups: NavGroup[];
  footer?: React.ReactNode;
  label?: string;
}) {
  const pathname = usePathname();

  return (
    <ResponsiveSidebar key={pathname} label={label}>
      <nav
        aria-label="アカウント・クリエイター"
        className="flex w-full shrink-0 flex-col gap-5 border-0 border-line bg-white p-3 lg:w-60 lg:border-r"
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 py-1 text-sm font-semibold  text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/mypage" &&
                  item.href !== "/studio" &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  prefetch={false}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "border-l-4 border-brand bg-brand-soft font-semibold text-accent-foreground"
                      : "border-l-4 border-transparent text-ink hover:bg-ground",
                  )}
                >
                  {item.label}
                  {item.badge ? (
                    <span className="ml-auto rounded-full bg-danger px-1.5 text-sm font-semibold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
        {footer && <div className="border-t border-line pt-3">{footer}</div>}
      </nav>
    </ResponsiveSidebar>
  );
}

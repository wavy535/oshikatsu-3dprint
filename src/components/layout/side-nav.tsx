"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavGroup = {
  label: string;
  items: { href: string; label: string; badge?: number }[];
};

/**
 * Figma ①購入フロー「マイページ 61:235」の左サイドナビ。
 * 「アカウント」と「クリエイター」の 2 グループで、ここからクリエイター管理へ入る。
 */
export function SideNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex w-full shrink-0 flex-col gap-4 rounded-xl border border-line bg-white p-3 lg:w-56">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2 py-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground">
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
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
                  active
                    ? "bg-brand-soft font-semibold text-accent-foreground"
                    : "text-ink hover:bg-ground"
                )}
              >
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

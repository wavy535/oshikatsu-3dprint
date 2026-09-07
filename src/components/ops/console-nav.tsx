"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Layers,
  Package,
  Printer,
  Truck,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Item = {
  label: string;
  href?: string;
  /** href が同じ項目を区別するための、クエリの一致条件 */
  match?: { status?: string };
  /** 暗色ヘッダーのタブにも出す項目 */
  inTabs?: boolean;
  icon: LucideIcon;
};

const OPS_ITEMS: Item[] = [
  { label: "印刷キュー", href: "/admin/print-queue", inTabs: true, icon: Package },
  {
    label: "検品・発送",
    href: "/admin/print-queue?status=printed",
    match: { status: "printed" },
    inTabs: true,
    icon: CheckCircle2,
  },
  { label: "出荷済み", href: "/admin/shipments", icon: Truck },
  { label: "注文一覧", href: "/admin/orders", inTabs: true, icon: ClipboardList },
];

const MASTER_ITEMS: Item[] = [
  { label: "フィラメント在庫", href: "/admin/filaments", inTabs: true, icon: Layers },
  { label: "プリンタ管理", icon: Printer },
  { label: "クリエイター審査", href: "/admin/creator-applications", inTabs: true, icon: UserCheck },
  { label: "売上・手数料", href: "/admin/sales", icon: BarChart3 },
  { label: "払込管理", href: "/admin/payouts", icon: Wallet },
];

/** href を持たない項目は、まだ画面が無いもの。押せるように見せない。 */
function useIsActive() {
  const pathname = usePathname();
  const params = useSearchParams();

  return (item: Item) => {
    if (!item.href) return false;
    const [path] = item.href.split("?");
    if (!pathname.startsWith(path)) return false;
    if (item.match?.status) return params.get("status") === item.match.status;
    // 「印刷キュー」と「検品・発送」は同じ画面。status=printed のときだけ後者を灯す
    if (path === "/admin/print-queue") return params.get("status") !== "printed";
    return true;
  };
}

/** 暗色ヘッダーのタブ。 */
export function ConsoleTabs() {
  const isActive = useIsActive();
  const items = [...OPS_ITEMS, ...MASTER_ITEMS].filter((i) => i.inTabs);

  return (
    <nav className="flex flex-wrap items-center gap-0.5">
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[18px] whitespace-nowrap transition-colors",
              isActive(item)
                ? "bg-console-2 font-semibold text-white"
                : "text-console-muted hover:bg-console-2 hover:text-console-ink"
            )}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.label}
            title="準備中"
            className="rounded-lg px-2.5 py-1.5 text-[11.5px] leading-[18px] whitespace-nowrap text-console-muted/60"
          >
            {item.label}
          </span>
        )
      )}
    </nav>
  );
}

/** 左のサブナビ。 */
export function ConsoleSideNav() {
  const isActive = useIsActive();

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const content = (
      <>
        <Icon className="size-[15px]" aria-hidden />
        {item.label}
      </>
    );
    const base =
      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] leading-[18px] transition-colors";

    if (!item.href) {
      return (
        <span
          key={item.label}
          title="準備中"
          className={cn(base, "text-muted-foreground/50")}
        >
          {content}
        </span>
      );
    }
    return (
      <Link
        key={item.label}
        href={item.href}
        className={cn(
          base,
          isActive(item)
            ? "bg-brand-soft font-semibold text-brand"
            : "text-ink hover:bg-ground"
        )}
      >
        {content}
      </Link>
    );
  };

  return (
    <aside className="hidden w-[204px] shrink-0 flex-col gap-0.5 rounded-xl border border-line bg-white p-2 lg:flex">
      <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground">
        オペレーション
      </p>
      {OPS_ITEMS.map(renderItem)}
      <p className="px-2.5 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground">マスタ</p>
      {MASTER_ITEMS.map(renderItem)}
    </aside>
  );
}

import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";

const NAV_ITEMS = [
  { href: "/studio", label: "ダッシュボード" },
  { href: "/studio/products", label: "作品管理" },
  { href: "/studio/reviews", label: "レビュー" },
  { href: "/studio/messages", label: "メッセージ" },
  { href: "/studio/sales", label: "売上・振込" },
];

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCreator();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <nav className="flex gap-4 text-sm">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

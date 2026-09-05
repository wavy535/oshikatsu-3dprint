import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";

const NAV_ITEMS = [
  { href: "/admin/orders", label: "注文管理" },
  { href: "/admin/products", label: "作品審査" },
  { href: "/admin/users", label: "クリエイター審査" },
  { href: "/admin/payouts", label: "払込管理" },
  { href: "/admin/reviews", label: "レビュー管理" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
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

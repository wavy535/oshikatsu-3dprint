import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

const NAV_ITEMS = [
  { href: "/mypage", label: "プロフィール" },
  { href: "/mypage/nuis", label: "マイぬい" },
  { href: "/mypage/addresses", label: "配送先" },
  { href: "/mypage/orders", label: "注文履歴" },
  { href: "/mypage/messages", label: "メッセージ" },
  { href: "/mypage/coordinates", label: "コーデ投稿" },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
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
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}

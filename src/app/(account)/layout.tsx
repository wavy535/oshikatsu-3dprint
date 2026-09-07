import { requireUser } from "@/lib/auth/guards";
import { getShellContext } from "@/features/layout/queries";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SideNav, type NavGroup } from "@/components/layout/side-nav";
import { signOut } from "@/features/auth/actions";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const shell = await getShellContext();

  const groups: NavGroup[] = [
    {
      label: "アカウント",
      items: [
        { href: "/mypage", label: "プロフィール" },
        { href: "/mypage/orders", label: "購入履歴" },
        { href: "/mypage/custom-orders", label: "オーダーメイド相談" },
        { href: "/mypage/nuis", label: "マイぬい" },
        { href: "/mypage/addresses", label: "配送先" },
        { href: "/mypage/messages", label: "メッセージ", badge: shell.unreadCount },
        { href: "/mypage/coordinates", label: "コーデ投稿" },
      ],
    },
    {
      label: "クリエイター",
      items: shell.isCreator
        ? [
            { href: "/studio", label: "売上ダッシュボード" },
            { href: "/studio/products", label: "作品管理" },
            { href: "/studio/custom-orders", label: "オーダーメイド相談" },
            { href: "/studio/fix-requests", label: "修正依頼" },
            { href: "/studio/reviews", label: "レビュー" },
            { href: "/studio/sales", label: "売上・振込" },
          ]
        : [{ href: "/creator/apply", label: "クリエイター登録" }],
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-6 py-6 lg:flex-row">
        <div className="flex flex-col gap-3 lg:w-56">
          <SideNav groups={groups} />
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              ログアウト
            </Button>
          </form>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

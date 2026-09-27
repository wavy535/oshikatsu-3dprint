import { requireUser } from "@/lib/auth/guards";
import { getShellContext } from "@/lib/layout/queries";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SideNav, type NavGroup } from "@/components/layout/side-nav";

/**
 * マイページとクリエイター登録の器。
 * サイドナビの並びは Figma「マイページ 61:235」の使用頻度順。
 */
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
        { href: "/mypage", label: "マイページ" },
        { href: "/mypage/orders", label: "購入履歴" },
        { href: "/mypage/notifications", label: "通知", badge: shell.unreadCount },
        { href: "/mypage/favorites", label: "お気に入り" },
        { href: "/mypage/nuis", label: "マイぬい" },
        { href: "/mypage/custom-orders", label: "オーダーメイド相談" },
        { href: "/mypage/messages", label: "メッセージ" },
        { href: "/mypage/addresses", label: "配送先・お支払い" },
        { href: "/mypage/notification-settings", label: "通知設定" },
      ],
    },
    {
      label: "クリエイター",
      items: shell.isCreator
        ? [
            { href: "/studio", label: "売上ダッシュボード" },
            { href: "/studio/works", label: "作品管理" },
            { href: "/studio/custom-orders", label: "オーダーメイド相談" },
            { href: "/studio/revisions", label: "修正依頼" },
            { href: "/studio/payouts", label: "売上の受け取り" },
          ]
        : [{ href: "/creator/apply", label: "出品について" }],
    },
    ...(shell.isAdmin
      ? [
          {
            label: "運営",
            items: [
              { href: "/admin/print-queue", label: "印刷キュー" },
              { href: "/admin/orders", label: "注文一覧" },
              { href: "/admin/sales", label: "売上・手数料" },
              { href: "/admin/payouts", label: "払込管理" },
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="page-shell workspace">
        <div className="flex min-w-0 shrink-0 flex-col gap-3 lg:w-60">
          <SideNav groups={groups} footer={<form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">ログアウト</Button>
          </form>} />
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

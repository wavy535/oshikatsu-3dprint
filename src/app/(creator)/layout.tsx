import { requireCreator } from "@/lib/auth/guards";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SideNav, type NavGroup } from "@/components/layout/side-nav";

/** クリエイター向け（スタジオ）の器。 */
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  await requireCreator();

  const groups: NavGroup[] = [
    {
      label: "クリエイター",
      items: [
        { href: "/studio", label: "売上ダッシュボード" },
        { href: "/studio/works", label: "作品管理" },
        { href: "/studio/custom-orders", label: "オーダーメイド相談" },
        { href: "/studio/revisions", label: "修正依頼" },
        { href: "/studio/payouts", label: "売上の受け取り" },
      ],
    },
    {
      label: "アカウント",
      items: [
        { href: "/mypage", label: "プロフィール" },
        { href: "/mypage/orders", label: "購入履歴" },
      ],
    },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="page-shell workspace">
        <div className="min-w-0 shrink-0 lg:w-60">
          <SideNav groups={groups} label="制作メニュー" />
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

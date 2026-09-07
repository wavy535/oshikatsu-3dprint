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
      <main className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-6 py-6 lg:flex-row">
        <div className="lg:w-56">
          <SideNav groups={groups} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

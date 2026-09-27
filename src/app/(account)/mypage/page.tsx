import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Package,
  Smile,
  ShieldCheck,
  Store,
} from "lucide-react";
import { queryResult } from "@/lib/db/result";
import { requireUser } from "@/lib/auth/guards";
import { getShellContext } from "@/lib/layout/queries";
import { Button } from "@/components/ui/button";

export const metadata = { title: "マイページ" };

export default async function MyPage() {
  const { db, user } = await requireUser("/mypage");
  const [{ data: profile }, shell] = await Promise.all([
    queryResult(
      db
        .selectFrom("profiles")
        .select(["profiles.display_name", "profiles.role", "profiles.bio"])
        .where("profiles.id", "=", user.id)
        .executeTakeFirstOrThrow(),
    ),
    getShellContext(),
  ]);
  const roleLabel =
    profile?.role === "admin"
      ? "運営メンバー"
      : profile?.role === "creator"
        ? "クリエイター"
        : "一般会員";
  return (
    <>
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          {profile?.display_name}さん、こんにちは。
        </p>
        <h1 className="page-title">マイページ</h1>
      </div>
      <section
        aria-labelledby="my-nui-heading"
        className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:p-7"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Smile className="size-7" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex-1">
          <h2 id="my-nui-heading" className="text-xl font-semibold">
            {shell.mainNui
              ? `${shell.mainNui.name}の居場所をさがそう`
              : "まずは、うちの子を登録しよう"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {shell.mainNui
              ? "登録したサイズをもとに、作品との相性を確認できます。"
              : "ぬいの名前と身長を登録すると、サイズに合う作品を選びやすくなります。"}
          </p>
        </div>
        <Button asChild>
          <Link href={shell.mainNui ? "/works" : "/mypage/nuis/new"}>
            {shell.mainNui ? "作品をさがす" : "ぬいを登録"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </section>
      <nav aria-label="よく使うメニュー" className="grid gap-3 sm:grid-cols-3">
        {[
          {
            href: "/mypage/nuis",
            label: "マイぬい",
            detail: "サイズの確認・登録",
            icon: Smile,
          },
          {
            href: "/mypage/favorites",
            label: "お気に入り",
            detail: "気になる作品を見返す",
            icon: Heart,
          },
          {
            href: "/mypage/orders",
            label: "購入履歴",
            detail: "注文とお届け状況",
            icon: Package,
          },
        ].map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-5 hover:border-brand"
          >
            <Icon className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="flex-1">
              <span className="block text-base font-semibold">{label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {detail}
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
        ))}
      </nav>
      <section
        aria-labelledby="profile-heading"
        className="rounded-2xl border border-line bg-white p-5 sm:p-7"
      >
        <h2 id="profile-heading" className="mb-5 text-xl font-semibold">
          登録情報
        </h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-[10rem_1fr] sm:gap-x-6 sm:gap-y-4">
          <dt className="font-semibold text-muted-foreground">表示名</dt>
          <dd className="-mt-3 text-base sm:mt-0">{profile?.display_name}</dd>
          <dt className="font-semibold text-muted-foreground">
            メールアドレス
          </dt>
          <dd className="-mt-3 break-all text-base sm:mt-0">{user.email}</dd>
          <dt className="font-semibold text-muted-foreground">会員種別</dt>
          <dd className="-mt-3 sm:mt-0">
            <span className="inline-block rounded-full bg-brand-soft px-3 py-1 font-medium text-brand">
              {roleLabel}
            </span>
          </dd>
          {profile?.bio && (
            <>
              <dt className="font-semibold text-muted-foreground">
                プロフィール
              </dt>
              <dd className="-mt-3 whitespace-pre-wrap text-base sm:mt-0">
                {profile.bio}
              </dd>
            </>
          )}
        </dl>
      </section>
      {(shell.isCreator || shell.isAdmin) && (
        <div className="flex flex-wrap gap-3">
          {shell.isCreator && (
            <Button asChild variant="outline">
              <Link href="/studio/works">
                <Store className="size-4" aria-hidden />
                作品管理へ
              </Link>
            </Button>
          )}
          {shell.isAdmin && (
            <Button asChild variant="outline">
              <Link href="/admin/print-queue">
                <ShieldCheck className="size-4" aria-hidden />
                運営コンソール
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

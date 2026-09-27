import { queryResult } from "@/lib/db/result";
import Link from "next/link";

import { requireUser } from "@/lib/auth/guards";
import { CreatorApplyForm } from "@/components/creator/apply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { creatorApplicationsEnabled } from "@/lib/auth/registration-policy";

export const metadata = { title: "クリエイター登録" };

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中",
  approved: "承認済み",
  rejected: "却下",
};

/**
 * クリエイター登録（申請）。確認済みメールと利用規約への同意を受け付ける。
 * 判定は DB のトリガーが最終的に行う。
 */
export default async function CreatorApplyPage() {
  const { db, user } = await requireUser("/creator/apply");
  if (!creatorApplicationsEnabled()) return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-6">
      <h1 className="page-title font-bold text-ink">クリエイター申請は準備中です</h1>
      <p className="text-sm text-muted-foreground">一般会員として作品の閲覧やお気に入り登録をご利用いただけます。申請の受付開始はこのページでお知らせします。</p>
      <Link href="/" className="text-sm text-brand hover:underline">作品を見る</Link>
    </div>
  );

  const [{ data: profile }, { data: applications }] = await Promise.all([
    queryResult(
      db
        .selectFrom("profiles")
        .select(["profiles.role"])
        .where("profiles.id", "=", user.id)
        .executeTakeFirstOrThrow(),
    ),
    queryResult(
      db
        .selectFrom("creator_applications")
        .select([
          "creator_applications.id",
          "creator_applications.status",
          "creator_applications.admin_note",
          "creator_applications.created_at",
          "creator_applications.reviewed_at",
          "creator_applications.terms_version",
        ])
        .where("creator_applications.user_id", "=", user.id)
        .orderBy("creator_applications.created_at", "desc")
        .execute(),
    ),
  ]);

  const latestPending = applications?.find((a) => a.status === "pending");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title font-bold text-ink">クリエイター登録</h1>
        {profile?.role === "buyer" && !latestPending && (
          <span className="text-sm text-muted-foreground">
            メール確認 → 利用規約に同意 → 運営の審査
          </span>
        )}
      </div>

      {profile?.role !== "buyer" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">
            {profile?.role === "creator"
              ? "すでにクリエイターとして登録されています"
              : "このアカウントは申請の対象外です"}
          </p>
          {profile?.role === "creator" && (
            <Button asChild size="sm">
              <Link href="/studio/works">作品管理へ</Link>
            </Button>
          )}
        </div>
      ) : latestPending ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <div className="flex items-center gap-2">
            <Badge variant="brand">審査中</Badge>
            <span className="num text-sm text-muted-foreground">
              申請日{" "}
              {new Date(latestPending.created_at).toLocaleDateString("ja-JP")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            運営が確認しています。結果は通知でお知らせします。
          </p>
        </div>
      ) : (
        <CreatorApplyForm emailVerified={user.emailVerified} />
      )}

      {applications && applications.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg leading-normal font-semibold text-ink">申請履歴</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {applications.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="num text-ink">
                  {new Date(a.created_at).toLocaleDateString("ja-JP")}
                </span>
                <span className="text-muted-foreground">
                  {STATUS_LABEL[a.status]}
                </span>
                {a.terms_version && (
                  <span className="num text-sm text-muted-foreground">
                    規約 {a.terms_version} 版に同意
                  </span>
                )}
                {a.status === "rejected" && a.admin_note && (
                  <span className="ml-auto text-sm text-muted-foreground">
                    運営より：{a.admin_note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

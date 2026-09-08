import { requireAdmin } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ReviewButtons } from "@/components/creator/review-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中",
  approved: "承認済み",
  rejected: "却下",
};

// このページ自体はSupabase Authのセッションでアクセス制御（admin roleチェック）を行い、
// 表示用のデータ取得は運営専用の Service Role Client（RLSバイパス）で行う。
// 承認/却下の書き込みは src/lib/creator/actions.ts が同様に admin チェック後に実行する。
export default async function CreatorApplicationsAdminPage() {
  // 権限は (admin)/layout.tsx の requireAdmin でも見ているが、
  // ページ単体でも成り立つようにここでも確認する
  await requireAdmin();

  const serviceClient = createServiceRoleClient();
  const { data: applications } = await serviceClient
    .from("creator_applications")
    .select(
      "id, user_id, status, message, admin_note, created_at, reviewed_at, phone, phone_verified_at, terms_version, terms_agreed_at, portfolio_url"
    )
    .order("created_at", { ascending: false });

  const userIds = [...new Set((applications ?? []).map((a) => a.user_id))];
  const { data: applicantProfiles } = userIds.length
    ? await serviceClient.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };

  const nameById = new Map((applicantProfiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>クリエイター申請の審査</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!applications || applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">申請はまだありません。</p>
          ) : (
            applications.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{nameById.get(a.user_id) ?? "不明なユーザー"}</span>
                    <Badge variant={a.status === "pending" ? "brand" : "default"}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("ja-JP")}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{a.message}</p>
                {/* 審査に要る本人確認の情報。番号は運営だけが見る（伏せない） */}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-ground px-3 py-2 text-[12px]">
                  <dt className="text-muted-foreground">SMS 認証</dt>
                  <dd className="num text-ink">
                    {a.phone
                      ? `${a.phone}（${new Date(a.phone_verified_at ?? a.created_at).toLocaleString("ja-JP")} 認証）`
                      : "未認証（旧形式の申請）"}
                  </dd>
                  <dt className="text-muted-foreground">利用規約</dt>
                  <dd className="num text-ink">
                    {a.terms_version
                      ? `${a.terms_version} 版に同意（${new Date(a.terms_agreed_at ?? a.created_at).toLocaleString("ja-JP")}）`
                      : "未同意（旧形式の申請）"}
                  </dd>
                  <dt className="text-muted-foreground">ポートフォリオ</dt>
                  <dd>
                    {a.portfolio_url ? (
                      <a
                        href={a.portfolio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-brand hover:underline"
                      >
                        {a.portfolio_url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">なし</span>
                    )}
                  </dd>
                </dl>
                {a.status === "pending" && <ReviewButtons applicationId={a.id} />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

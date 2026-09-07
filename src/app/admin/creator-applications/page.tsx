import { redirect } from "next/navigation";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/creator-applications");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const serviceClient = createServiceRoleClient();
  const { data: applications } = await serviceClient
    .from("creator_applications")
    .select("id, user_id, status, message, admin_note, created_at, reviewed_at")
    .order("created_at", { ascending: false });

  const userIds = [...new Set((applications ?? []).map((a) => a.user_id))];
  const { data: applicantProfiles } = userIds.length
    ? await serviceClient.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };

  const nameById = new Map((applicantProfiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
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
                <p className="text-sm">{a.message}</p>
                {a.status === "pending" && <ReviewButtons applicationId={a.id} />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

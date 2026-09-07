import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CreatorApplyForm } from "@/components/creator/apply-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中",
  approved: "承認済み",
  rejected: "却下",
};

export default async function CreatorApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/creator/apply");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: applications } = await supabase
    .from("creator_applications")
    .select("id, status, message, admin_note, created_at, reviewed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const latestPending = applications?.find((a) => a.status === "pending");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>クリエイター申請</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {profile?.role !== "buyer" ? (
            <p className="text-sm text-muted-foreground">
              {profile?.role === "creator"
                ? "すでにクリエイターとして登録されています。"
                : "このアカウントは申請の対象外です。"}
            </p>
          ) : latestPending ? (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-4">
              <div className="flex items-center gap-2">
                <Badge variant="brand">審査中</Badge>
                <span className="text-xs text-muted-foreground">
                  申請日：{new Date(latestPending.created_at).toLocaleDateString("ja-JP")}
                </span>
              </div>
              <p className="text-sm">{latestPending.message}</p>
            </div>
          ) : (
            <CreatorApplyForm />
          )}

          {applications && applications.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">申請履歴</h2>
              {applications.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>{new Date(a.created_at).toLocaleDateString("ja-JP")}</span>
                  <span className="text-muted-foreground">{STATUS_LABEL[a.status]}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

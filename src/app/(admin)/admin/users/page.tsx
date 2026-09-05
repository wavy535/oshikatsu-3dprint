import { requireAdmin } from "@/lib/auth/guards";
import { listPendingCreatorApplications } from "@/features/admin/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewActions } from "./review-actions";

export default async function AdminUsersPage() {
  await requireAdmin();
  const applications = await listPendingCreatorApplications();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">クリエイター審査</h1>
      {applications.length === 0 && (
        <p className="text-sm text-muted-foreground">審査待ちの申請はありません</p>
      )}
      <div className="flex flex-col gap-3">
        {applications.map((app) => (
          <Card key={app.user_id}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={app.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback>{app.profiles?.display_name?.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{app.legal_name}（{app.legal_name_kana}）</p>
                  <p className="text-sm text-muted-foreground">
                    @{app.profiles?.handle} / 生年月日: {app.birth_date}
                  </p>
                  {app.portfolio_url && (
                    <a
                      href={app.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline underline-offset-2"
                    >
                      ポートフォリオ
                    </a>
                  )}
                </div>
              </div>
              <ReviewActions userId={app.user_id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

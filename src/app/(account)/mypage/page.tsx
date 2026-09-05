import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getMyCreatorProfile, getMyProfile } from "@/features/auth/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarForm } from "./avatar-form";
import { ProfileForm } from "./profile-form";

const CREATOR_STATUS_LABEL: Record<string, string> = {
  pending: "審査中",
  approved: "承認済み",
  suspended: "停止中",
};

export default async function MyPage() {
  const { user } = await requireUser();
  const [profile, creatorProfile] = await Promise.all([
    getMyProfile(user.id),
    getMyCreatorProfile(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>プロフィール</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarForm avatarUrl={profile.avatar_url} displayName={profile.display_name} />
          <ProfileForm
            defaultValues={{
              handle: profile.handle,
              displayName: profile.display_name,
              bio: profile.bio ?? "",
              emailOptIn: profile.email_opt_in,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>クリエイター</CardTitle>
        </CardHeader>
        <CardContent>
          {creatorProfile ? (
            <div className="flex items-center gap-2 text-sm">
              <span>申請ステータス:</span>
              <Badge variant="outline">
                {CREATOR_STATUS_LABEL[creatorProfile.status] ?? creatorProfile.status}
              </Badge>
              {creatorProfile.status === "suspended" && creatorProfile.reject_reason && (
                <span className="text-muted-foreground">
                  （{creatorProfile.reject_reason}）
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                作品を投稿するにはクリエイター申請が必要です
              </p>
              <Button render={<Link href="/creator/apply" />} size="sm">
                クリエイター申請
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

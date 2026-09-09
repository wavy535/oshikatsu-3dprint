import { queryResult } from "@/lib/db/result";
import { requireUser } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "プロフィール" };

export default async function MyPage() {
  const { db, user } = await requireUser("/mypage");

  const { data: profile } = await queryResult(
    db
      .selectFrom("profiles")
      .select(["profiles.display_name", "profiles.role", "profiles.bio"])
      .where("profiles.id", "=", user.id)
      .executeTakeFirstOrThrow(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>プロフィール</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">表示名：{profile?.display_name}</p>
        <p className="text-sm">メールアドレス：{user.email}</p>
        <p className="text-sm">ロール：{profile?.role}</p>
        {profile?.bio ? (
          <p className="text-sm text-muted-foreground">{profile.bio}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

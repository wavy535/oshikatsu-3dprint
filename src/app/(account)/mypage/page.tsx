import { requireUser } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "プロフィール" };

export default async function MyPage() {
  const { supabase, user } = await requireUser("/mypage");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, bio")
    .eq("id", user.id)
    .single();

  return (
    <Card>
      <CardHeader>
        <CardTitle>プロフィール</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">表示名：{profile?.display_name}</p>
        <p className="text-sm">メールアドレス：{user.email}</p>
        <p className="text-sm">ロール：{profile?.role}</p>
        {profile?.bio ? <p className="text-sm text-muted-foreground">{profile.bio}</p> : null}
      </CardContent>
    </Card>
  );
}

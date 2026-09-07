import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/mypage");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>マイページ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">表示名：{profile?.display_name}</p>
          <p className="text-sm">メールアドレス：{user.email}</p>
          <p className="text-sm">ロール：{profile?.role}</p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              ログアウト
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

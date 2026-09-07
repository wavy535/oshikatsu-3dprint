import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">確認メールを送信しました</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ご登録のメールアドレスに確認リンクを送信しました。メール内のリンクをクリックして登録を完了してください。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

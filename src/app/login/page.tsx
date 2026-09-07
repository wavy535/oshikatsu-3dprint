import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Link href="/" className="text-xl font-bold text-primary">
            Osinest
          </Link>
          <CardTitle className="text-lg">ログイン</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

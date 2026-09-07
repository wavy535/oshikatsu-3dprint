import Link from "next/link";

import { SignUpForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Link href="/" className="text-xl font-bold text-primary">
            Osinest
          </Link>
          <CardTitle className="text-lg">新規登録</CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" name="displayName" placeholder="例：yumeko_craft" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">パスワード</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
        <p className="text-xs text-muted-foreground">8文字以上で入力してください</p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "登録中..." : "アカウントを作成する"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}

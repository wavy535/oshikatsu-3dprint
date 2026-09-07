"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signInAction, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">パスワード</Label>
        <Input id="password" name="password" type="password" required />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "ログイン中..." : "ログイン"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          新規登録
        </Link>
      </p>
    </form>
  );
}

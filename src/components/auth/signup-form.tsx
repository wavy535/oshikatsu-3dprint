"use client";

import { useActionState } from "react";

import { signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

/**
 * 会員登録。確認メールを使う環境だけコード入力へ進み、メールなしの公開ではそのままログインする。
 */
export function SignupForm({ verifyEmail = true }: { verifyEmail?: boolean }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" name="displayName" autoComplete="nickname" placeholder="ぬい活マニア" required maxLength={50} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">メールアドレス</Label>
        <Input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">パスワード</Label>
        <Input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="text-sm text-muted-foreground">8文字以上</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password-confirm">パスワード（確認）</Label>
        <Input
          id="signup-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>

      {state.error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "登録中..." : verifyEmail ? "確認コードを送る" : "会員登録する"}
      </Button>
      <p className="text-sm leading-6 text-muted-foreground">
        {verifyEmail ? "入力したアドレスに6桁の確認コードを送ります。コードの有効期限は10分です。" : "登録後、そのままご利用いただけます。現在、メール通知・メールによるパスワード再設定とクリエイター申請は準備中です。"}
      </p>
    </form>
  );
}

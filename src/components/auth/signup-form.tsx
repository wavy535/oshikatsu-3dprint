"use client";

import { useActionState } from "react";

import { signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

/**
 * 新規会員登録。メール＋パスワード2回を送ると、そのアドレスに6桁の確認コードが届く。
 * 登録の完了は /signup/verify で行う。
 */
export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" name="displayName" placeholder="ぬい活マニア" required maxLength={50} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">メールアドレス</Label>
        <Input id="signup-email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">パスワード</Label>
        <Input id="signup-password" name="password" type="password" required minLength={8} />
        <p className="text-[11px] text-muted-foreground">8文字以上</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password-confirm">パスワード（確認）</Label>
        <Input
          id="signup-password-confirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "送信中..." : "確認コードを送る"}
      </Button>
      <p className="text-[11px] leading-4 text-muted-foreground">
        入力したアドレスに6桁の確認コードを送ります。コードの有効期限は10分です。
      </p>
    </form>
  );
}

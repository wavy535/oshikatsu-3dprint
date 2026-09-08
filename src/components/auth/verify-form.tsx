"use client";

import { useActionState, useState } from "react";

import {
  resendSignUpCodeAction,
  verifySignUpAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { CodeBoxes } from "@/components/auth/code-boxes";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null };

/** 新規登録の確認コード。マスの挙動は CodeBoxes（SMS 認証と共用）。 */
export function VerifyForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(verifySignUpAction, initialState);
  const [resendState, resendAction, resending] = useActionState(
    resendSignUpCodeAction,
    initialState
  );
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={digits.join("")} />

        <CodeBoxes digits={digits} onChange={setDigits} />

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={pending || digits.join("").length < 6}>
          {pending ? "確認中..." : "登録を完了する"}
        </Button>
      </form>

      <form action={resendAction} className="flex flex-col gap-1">
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="ghost" size="sm" disabled={resending}>
          {resending ? "再送しています..." : "確認コードを再送する"}
        </Button>
        {resendState.error ? (
          <p className="text-center text-[11px] text-destructive">{resendState.error}</p>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            届かない場合は60秒あけて再送してください
          </p>
        )}
      </form>
    </div>
  );
}

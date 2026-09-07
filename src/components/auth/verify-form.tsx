"use client";

import { useActionState, useRef, useState } from "react";

import {
  resendSignUpCodeAction,
  verifySignUpAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null };

/**
 * 6桁の確認コード。1マス1文字で、入力すると次のマスへ進み、
 * 空のマスで Backspace を押すと前へ戻る（プロトタイプの挙動に合わせている）。
 */
export function VerifyForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(verifySignUpAction, initialState);
  const [resendState, resendAction, resending] = useActionState(
    resendSignUpCodeAction,
    initialState
  );
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={digits.join("")} />

        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`確認コード ${i + 1}文字目`}
              className="h-12 w-11 rounded-lg border border-line bg-white text-center text-lg font-semibold text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
              onChange={(e) => {
                const chars = e.target.value.replace(/\D/g, "");
                if (!chars) return setDigit(i, "");
                // 貼り付けにも対応する（6桁まとめて入る）
                if (chars.length > 1) {
                  const next = [...digits];
                  for (let k = 0; k < chars.length && i + k < 6; k++) next[i + k] = chars[k];
                  setDigits(next);
                  boxes.current[Math.min(i + chars.length, 5)]?.focus();
                  return;
                }
                setDigit(i, chars);
                if (i < 5) boxes.current[i + 1]?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) {
                  boxes.current[i - 1]?.focus();
                  setDigit(i - 1, "");
                }
              }}
            />
          ))}
        </div>

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

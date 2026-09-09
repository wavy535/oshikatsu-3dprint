"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";

import { grantAdminAction, revokeAdminAction } from "@/lib/ops/members-actions";
import { type OpsActionState } from "@/lib/ops/action-state";
import { Button } from "@/components/ui/button";

const initial: OpsActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand";

/**
 * 運営メンバーの追加。招待メールは送らず、登録済みのユーザーをメールアドレスで指す。
 * 見つからない・すでに運営、などの判断は DB の関数が返すメッセージをそのまま出す。
 */
export function AddMemberForm() {
  const [state, action, pending] = useActionState(grantAdminAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">登録済みユーザーのメールアドレス</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="staff@example.com"
          className={FIELD}
        />
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        <UserPlus className="size-3.5" aria-hidden />
        運営メンバーに追加
      </Button>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      {state.message && <p className="text-[11px] text-ok">{state.message}</p>}
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        先に本人が普通に会員登録している必要があります。追加した人は運営コンソールの
        すべての画面を操作できます。
      </p>
    </form>
  );
}

/** 一覧の行に置く解除ボタン。自分自身の行には出さない。 */
export function RevokeMemberButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(revokeAdminAction, initial);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-0.5">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-danger/40 bg-white px-2 py-1 text-[10.5px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50"
      >
        解除する
      </button>
      {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
    </form>
  );
}

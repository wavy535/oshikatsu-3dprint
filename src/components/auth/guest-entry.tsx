"use client";
import { useActionState } from "react";
import { enterGuestAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function GuestEntry({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState(enterGuestAction, { error: null });
  return <form action={action} className="flex flex-col gap-4">
    <h1 className="text-lg font-bold">ゲストでOshiNestを試す</h1>
    <p className="text-sm leading-6 text-muted-foreground">登録なしで作品の投稿やデモ購入を試せます。実際の支払い・発送はありません。</p>
    <p className="text-xs leading-5 text-muted-foreground">同じブラウザで続きから利用できます。ログアウトやCookieの削除後は、以前のゲストデータには戻れません。</p>
    <input type="hidden" name="redirect" value={redirectTo ?? "/"} />
    {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "準備しています…" : "ゲストで始める"}</Button>
  </form>;
}

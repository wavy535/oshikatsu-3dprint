"use client";

import { useActionState } from "react";
import { Landmark, Send } from "lucide-react";

import { requestPayoutAction, savePayoutAccountAction, type PayoutActionState } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";

const initial: PayoutActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink outline-none focus:border-brand";

function Notice({ state }: { state: PayoutActionState }) {
  if (state.error) return <p className="text-[11px] text-danger">{state.error}</p>;
  if (state.message) return <p className="text-[11px] text-ok">{state.message}</p>;
  return null;
}

export type PayoutAccount = {
  bank_name: string;
  branch_name: string;
  account_type: string;
  account_number: string;
  account_holder_name: string;
} | null;

/** 振込先口座。 */
export function PayoutAccountForm({ account }: { account: PayoutAccount }) {
  const [state, action, pending] = useActionState(savePayoutAccountAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">銀行名</span>
          <input name="bankName" required defaultValue={account?.bank_name ?? ""} placeholder="北陸銀行" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">支店名</span>
          <input name="branchName" required defaultValue={account?.branch_name ?? ""} placeholder="金沢支店" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">口座種別</span>
          <select name="accountType" defaultValue={account?.account_type ?? "普通"} className={FIELD}>
            <option value="普通">普通</option>
            <option value="当座">当座</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">口座番号（7桁）</span>
          <input name="accountNumber" required inputMode="numeric" pattern="\d{7}" defaultValue={account?.account_number ?? ""} placeholder="1234567" className={FIELD} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">口座名義（カナ）</span>
        <input name="accountHolderName" required defaultValue={account?.account_holder_name ?? ""} placeholder="ミルク コウボウ" className={FIELD} />
      </label>
      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        <Landmark className="size-3.5" aria-hidden />
        {account ? "口座を変更する" : "口座を登録する"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

/** 振込の申請ボタン（受取可能額の全額）。 */
export function RequestPayoutButton({ amount, hasAccount }: { amount: number; hasAccount: boolean }) {
  const [state, action, pending] = useActionState(requestPayoutAction, initial);
  const disabled = pending || amount < 1000 || !hasAccount;
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="amount" value={amount} />
      <Button type="submit" size="lg" disabled={disabled} className="w-full">
        <Send className="size-3.5" aria-hidden />
        振込を申請する
      </Button>
      {!hasAccount ? (
        <p className="text-[10.5px] text-muted-foreground">先に振込先口座を登録してください。</p>
      ) : amount < 1000 ? (
        <p className="text-[10.5px] text-muted-foreground">受取可能額が ¥1,000 に達すると申請できます。</p>
      ) : null}
      <Notice state={state} />
    </form>
  );
}

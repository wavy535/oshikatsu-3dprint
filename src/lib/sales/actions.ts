"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCreator } from "@/lib/auth/guards";

export type PayoutActionState = { error: string | null; message?: string };

const accountSchema = z.object({
  bankName: z.string().min(1, "銀行名を入れてください").max(40),
  branchName: z.string().min(1, "支店名を入れてください").max(40),
  accountType: z.enum(["普通", "当座"]),
  accountNumber: z.string().regex(/^\d{7}$/, "口座番号は数字7桁で入力してください"),
  accountHolderName: z.string().min(1, "口座名義（カナ）を入れてください").max(60),
});

/** 振込先口座の登録・変更（1人1口座）。 */
export async function savePayoutAccountAction(
  _prev: PayoutActionState,
  formData: FormData
): Promise<PayoutActionState> {
  const parsed = accountSchema.safeParse({
    bankName: String(formData.get("bankName") ?? "").trim(),
    branchName: String(formData.get("branchName") ?? "").trim(),
    accountType: formData.get("accountType"),
    accountNumber: String(formData.get("accountNumber") ?? "").replace(/\D/g, ""),
    accountHolderName: String(formData.get("accountHolderName") ?? "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const v = parsed.data;

  const { supabase, user } = await requireCreator();
  const { data, error } = await supabase
    .from("payout_accounts")
    .upsert(
      {
        creator_id: user.id,
        bank_name: v.bankName,
        branch_name: v.branchName,
        account_type: v.accountType,
        account_number: v.accountNumber,
        account_holder_name: v.accountHolderName,
      },
      { onConflict: "creator_id" }
    )
    .select("creator_id");
  if (error || !data || data.length === 0) {
    return { error: `口座を保存できませんでした（${error?.message ?? "0件"}）` };
  }

  revalidatePath("/studio");
  revalidatePath("/studio/payouts");
  return { error: null, message: "振込先口座を保存しました" };
}

/**
 * 振込の申請。金額は受取可能額の全額（部分申請は無し。DB のトリガーが残高を検査する）。
 */
export async function requestPayoutAction(
  _prev: PayoutActionState,
  formData: FormData
): Promise<PayoutActionState> {
  const amount = Number(formData.get("amount") ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) return { error: "申請できる金額がありません" };

  const { supabase, user } = await requireCreator();
  const { data, error } = await supabase
    .from("payout_requests")
    .insert({ creator_id: user.id, amount })
    .select("id");
  if (error || !data || data.length === 0) {
    // トリガーの文言（口座未登録・残高超過・下限）をそのまま見せる
    return { error: error?.message ?? "申請できませんでした" };
  }

  revalidatePath("/studio");
  revalidatePath("/studio/payouts");
  return { error: null, message: `¥${amount.toLocaleString("ja-JP")} の振込を申請しました` };
}

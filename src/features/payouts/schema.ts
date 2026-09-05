import { z } from "zod";

// DESIGN.md §4.4.1 payout_accounts の check 制約に準拠
export const upsertPayoutAccountSchema = z.object({
  bankName: z.string().min(1).max(40),
  bankCode: z.string().regex(/^\d{4}$/, "銀行コードは4桁の数字で入力してください"),
  branchName: z.string().min(1).max(40),
  branchCode: z.string().regex(/^\d{3}$/, "支店コードは3桁の数字で入力してください"),
  accountType: z.enum(["ordinary", "checking"]),
  accountNumber: z.string().regex(/^\d{1,7}$/, "口座番号は7桁以内の数字で入力してください"),
  accountHolderKana: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[ｦ-ﾟア-ンー（）.\-　 ]+$/, "口座名義はカナで入力してください"),
});
export type UpsertPayoutAccountInput = z.input<typeof upsertPayoutAccountSchema>;

export const adminMarkPayoutPaidSchema = z.object({
  payoutId: z.string().uuid(),
  transactionRef: z.string().min(1).max(80),
});
export type AdminMarkPayoutPaidInput = z.input<typeof adminMarkPayoutPaidSchema>;

export const adminExportPayoutCsvSchema = z.object({
  payoutIds: z.array(z.string().uuid()).min(1, "対象を1件以上選択してください"),
});
export type AdminExportPayoutCsvInput = z.input<typeof adminExportPayoutCsvSchema>;

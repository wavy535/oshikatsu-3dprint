"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  upsertPayoutAccountSchema,
  adminMarkPayoutPaidSchema,
  adminExportPayoutCsvSchema,
  type UpsertPayoutAccountInput,
  type AdminMarkPayoutPaidInput,
  type AdminExportPayoutCsvInput,
} from "./schema";

// DESIGN.md §8.6: 口座は暗号化保存。鍵は DB に置かず環境変数から都度渡す。
function getPayoutEncryptionKey(): string {
  const key = process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  if (!key) throw new Error("PAYOUT_ACCOUNT_ENCRYPTION_KEY が設定されていません");
  return key;
}

export async function upsertPayoutAccount(
  input: UpsertPayoutAccountInput
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const parsed = upsertPayoutAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase.rpc("upsert_payout_account", {
    p_bank_name: v.bankName,
    p_bank_code: v.bankCode,
    p_branch_name: v.branchName,
    p_branch_code: v.branchCode,
    p_account_type: v.accountType,
    p_account_number: v.accountNumber,
    p_account_holder_kana: v.accountHolderKana,
    p_key: getPayoutEncryptionKey(),
  });
  if (error) return { ok: false, error: "口座情報の登録に失敗しました" };

  revalidatePath("/studio/sales");
  return { ok: true, data: undefined };
}

export async function adminMarkPayoutPaid(
  input: AdminMarkPayoutPaidInput
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = adminMarkPayoutPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase.rpc("admin_mark_payout_paid", {
    p_payout_id: v.payoutId,
    p_transaction_ref: v.transactionRef,
  });
  if (error) return { ok: false, error: "支払完了の記録に失敗しました" };

  revalidatePath("/admin/payouts");
  return { ok: true, data: undefined };
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  ordinary: "普通",
  checking: "当座",
};

export async function adminExportPayoutCsv(
  input: AdminExportPayoutCsvInput
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const { supabase } = await requireAdmin();

  const parsed = adminExportPayoutCsvSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data, error } = await supabase.rpc("admin_export_payout_accounts", {
    p_payout_ids: v.payoutIds,
    p_key: getPayoutEncryptionKey(),
  });
  if (error || !data) return { ok: false, error: "CSV出力に失敗しました（振込先口座が未登録の可能性があります）" };

  const header = [
    "銀行名",
    "銀行コード",
    "支店名",
    "支店コード",
    "預金種目",
    "口座番号",
    "口座名義",
    "振込金額",
  ];
  const rows = data.map((r) =>
    [
      r.bank_name,
      r.bank_code,
      r.branch_name,
      r.branch_code,
      ACCOUNT_TYPE_LABEL[r.account_type] ?? r.account_type,
      r.account_number,
      r.account_holder_kana,
      String(r.net_amount),
    ]
      .map((f) => `"${String(f).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\r\n");
  const filename = `payouts_${new Date().toISOString().slice(0, 10)}.csv`;

  return { ok: true, data: { csv, filename } };
}

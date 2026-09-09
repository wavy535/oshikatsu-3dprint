"use server";

import { call } from "@/lib/db/functions";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/auth/guards";
import type { OpsActionState } from "./action-state";

// =============================================================================
// 運営メンバー
//   role の書き換えは DB の関数（grant_admin / revoke_admin）だけが行う。
//   「自分は解除できない」「最後の1人は解除できない」の判断も関数側にある。
// =============================================================================

const emailSchema = z
  .string()
  .trim()
  .email("メールアドレスの形式が正しくありません")
  .max(254);

export async function grantAdminAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力を確認してください",
    };

  const { db } = await requireAdmin();
  const { error } = await call(db, "grant_admin", { p_email: parsed.data });
  if (error) return { error: error.message };

  revalidatePath("/admin/members");
  return {
    error: null,
    message: `${parsed.data} を運営メンバーに追加しました`,
  };
}

export async function revokeAdminAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = idSchema.safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "操作が不正です" };

  const { db } = await requireAdmin();
  const { error } = await call(db, "revoke_admin", { p_user_id: parsed.data });
  if (error) return { error: error.message };

  revalidatePath("/admin/members");
  return { error: null };
}

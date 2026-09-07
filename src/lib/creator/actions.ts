"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const applySchema = z.object({
  message: z
    .string()
    .min(20, "活動内容やご希望のカテゴリなど、20文字以上でご記入ください")
    .max(2000),
});

export type CreatorApplyActionState = {
  error: string | null;
  success?: boolean;
};

// 購入者（buyer）がクリエイター申請を提出する。
// DB側のRLS（buyers submit creator applications）が role='buyer' であることと
// pending申請が同時に1件までであることを最終的に強制する。
export async function applyForCreatorAction(
  _prevState: CreatorApplyActionState,
  formData: FormData
): Promise<CreatorApplyActionState> {
  const parsed = applySchema.safeParse({ message: formData.get("message") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "ログインが必要です" };
  }

  const { error } = await supabase.from("creator_applications").insert({
    user_id: user.id,
    message: parsed.data.message,
  });

  if (error) {
    // 部分ユニークインデックス（同時に1件のpendingのみ）に抵触した場合など
    if (error.code === "23505") {
      return { error: "すでに審査中の申請があります" };
    }
    return { error: "申請の送信に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/creator/apply");
  return { error: null, success: true };
}

export type ReviewActionState = {
  error: string | null;
};

// 運営（admin）による承認・却下。Service Role Keyを使いRLSをバイパスするため、
// 呼び出し前に必ず「現在のユーザーがadminであること」をセッション付きクライアントで確認する。
async function assertIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("この操作を行う権限がありません");
  }

  return user;
}

export async function approveCreatorApplicationAction(
  applicationId: string
): Promise<ReviewActionState> {
  try {
    const admin = await assertIsAdmin();
    const serviceClient = createServiceRoleClient();

    const { error } = await serviceClient
      .from("creator_applications")
      .update({ status: "approved", reviewed_by: admin.id })
      .eq("id", applicationId);

    if (error) {
      return { error: "承認処理に失敗しました" };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "承認処理に失敗しました" };
  }

  revalidatePath("/admin/creator-applications");
  return { error: null };
}

export async function rejectCreatorApplicationAction(
  applicationId: string,
  adminNote?: string
): Promise<ReviewActionState> {
  try {
    const admin = await assertIsAdmin();
    const serviceClient = createServiceRoleClient();

    const { error } = await serviceClient
      .from("creator_applications")
      .update({ status: "rejected", reviewed_by: admin.id, admin_note: adminNote ?? null })
      .eq("id", applicationId);

    if (error) {
      return { error: "却下処理に失敗しました" };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "却下処理に失敗しました" };
  }

  revalidatePath("/admin/creator-applications");
  return { error: null };
}

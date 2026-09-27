"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";
import { serviceDatabase } from "@/lib/db/client";
import { CREATOR_TERMS_VERSION } from "@/lib/creator/terms";
import { creatorApplicationsEnabled } from "@/lib/auth/registration-policy";

// ───────── 申請 ─────────

const applySchema = z.object({
  agreeTerms: z.literal("on", {
    message: "クリエイター利用規約への同意が必要です",
  }),
  termsVersion: z.literal(CREATOR_TERMS_VERSION, {
    message:
      "利用規約が更新されました。画面を再読み込みして、最新の規約を確認してください",
  }),
});

export type CreatorApplyActionState = {
  error: string | null;
  success?: boolean;
};

/** 確認済みメールと規約同意を検証し、運営の審査へ送る。 */
export async function applyForCreatorAction(
  _prevState: CreatorApplyActionState,
  formData: FormData,
): Promise<CreatorApplyActionState> {
  if (!creatorApplicationsEnabled()) return { error: "クリエイター申請は現在準備中です" };
  const parsed = applySchema.safeParse({
    agreeTerms: formData.get("agreeTerms"),
    termsVersion: formData.get("termsVersion"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { db, user } = await getOptionalUser();

  if (!user) {
    return { error: "ログインが必要です" };
  }
  if (!user.emailVerified) {
    return { error: "メールアドレスの確認を済ませてください" };
  }

  const { error } = await queryResult(
    db
      .insertInto("creator_applications")
      .values({
        user_id: user.id,
        terms_version: parsed.data.termsVersion,
      })
      .execute(),
  );

  if (error) {
    // 部分ユニークインデックス（同時に1件のpendingのみ）に抵触した場合など
    if (error.code === "23505") {
      return { error: "すでに審査中の申請があります" };
    }
    if (error.message.includes("email_not_verified")) {
      return { error: "メールアドレスの確認を済ませてください" };
    }
    if (error.message.includes("terms_not_agreed")) {
      return { error: "クリエイター利用規約への同意が必要です" };
    }
    console.error("[applyForCreator]", error.message);
    return {
      error: "申請の送信に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/creator/apply");
  return { error: null, success: true };
}

export type ReviewActionState = {
  error: string | null;
};

// 運営（admin）による承認・却下。信頼されたサーバー用DBロールを使うため、
// 呼び出し前に必ず「現在のユーザーがadminであること」をセッション付きクライアントで確認する。
async function assertIsAdmin() {
  const { db, user } = await getOptionalUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  const { data: profile } = await queryResult(
    db
      .selectFrom("profiles")
      .select(["profiles.role"])
      .where("profiles.id", "=", user.id)
      .executeTakeFirstOrThrow(),
  );

  if (profile?.role !== "admin") {
    throw new Error("この操作を行う権限がありません");
  }

  return user;
}

export async function approveCreatorApplicationAction(
  applicationId: string,
): Promise<ReviewActionState> {
  try {
    const admin = await assertIsAdmin();
    const serviceDb = serviceDatabase();

    const { error } = await queryResult(
      serviceDb
        .updateTable("creator_applications")
        .set({ status: "approved", reviewed_by: admin.id })
        .where("creator_applications.id", "=", applicationId)
        .execute(),
    );

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
  adminNote?: string,
): Promise<ReviewActionState> {
  try {
    const admin = await assertIsAdmin();
    const serviceDb = serviceDatabase();

    const { error } = await queryResult(
      serviceDb
        .updateTable("creator_applications")
        .set({
          status: "rejected",
          reviewed_by: admin.id,
          admin_note: adminNote ?? null,
        })
        .where("creator_applications.id", "=", applicationId)
        .execute(),
    );

    if (error) {
      return { error: "却下処理に失敗しました" };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "却下処理に失敗しました" };
  }

  revalidatePath("/admin/creator-applications");
  return { error: null };
}

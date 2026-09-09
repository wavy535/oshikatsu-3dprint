"use server";
import { authMutation } from "@/lib/auth/mutation";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";
import { serviceDatabase } from "@/lib/db/client";
import { CREATOR_TERMS_VERSION } from "@/lib/creator/terms";
import { maskPhone, toE164 } from "@/lib/creator/phone";

// ───────── 電話番号（SMS 認証）─────────

export type PhoneActionState = {
  error: string | null;
  /** コードを送った番号（E.164）。送信後の画面がこれを持って verify を呼ぶ */
  sentTo?: string;
  /** 認証が済んだ番号（伏せ字） */
  verifiedMasked?: string;
};

const phoneSchema = z.object({
  phone: z.string().min(1, "電話番号を入力してください"),
});

/** SMSで本人確認コードを送る。開発環境ではMailpitで確認する。 */
export async function sendPhoneCodeAction(
  prev: PhoneActionState,
  formData: FormData,
): Promise<PhoneActionState> {
  const parsed = phoneSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "電話番号を入力してください",
    };

  const e164 = toE164(parsed.data.phone);
  if (!e164)
    return {
      error: "携帯電話の番号（070/080/090 から始まる11桁）を入力してください",
    };

  const { user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  // すでに同じ番号で認証済みなら送らない
  if (user.phoneNumber === e164 && user.phoneNumberVerified) {
    return { error: null, verifiedMasked: maskPhone(e164) ?? undefined };
  }

  const { error } = await authMutation("/phone-number/send-otp", {
    phoneNumber: e164,
  });
  if (error) {
    const sentTo = prev.sentTo === e164 ? e164 : undefined;
    if (error.status === 429) {
      return {
        sentTo,
        error:
          "送信の間隔が短すぎます。1分ほど待ってからもう一度お試しください",
      };
    }
    if (/already|registered|exists/i.test(error.message)) {
      return { sentTo, error: "この電話番号は別のアカウントで使われています" };
    }
    console.error("[sendPhoneCode]", error.message);
    return {
      sentTo,
      error:
        "認証コードを送れませんでした。番号を確認して、しばらくしてからお試しください",
    };
  }

  return { error: null, sentTo: e164 };
}

const verifyPhoneSchema = z.object({
  phone: z.string().min(1),
  token: z.string().regex(/^\d{6}$/, "6桁の認証コードを入力してください"),
});

/** 届いた6桁のコードで番号を確定する */
export async function verifyPhoneCodeAction(
  _prev: PhoneActionState,
  formData: FormData,
): Promise<PhoneActionState> {
  const parsed = verifyPhoneSchema.safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "認証コードを入力してください",
      sentTo: String(formData.get("phone") ?? ""),
    };
  }

  const { error } = await authMutation("/phone-number/verify", {
    phoneNumber: parsed.data.phone,
    code: parsed.data.token,
    updatePhoneNumber: true,
  });

  if (error) {
    return {
      error: "認証コードが正しくないか、有効期限が切れています",
      sentTo: parsed.data.phone,
    };
  }

  revalidatePath("/creator/apply");
  return {
    error: null,
    verifiedMasked: maskPhone(parsed.data.phone) ?? undefined,
  };
}

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

/**
 * 購入者（buyer）がクリエイター申請を提出する。
 * RLS（buyers submit creator applications）が role='buyer' と pending 1件までを、
 * トリガーが「SMS 認証済み」と「規約に同意済み」を最終的に強制する。
 * 電話番号と同意時刻はトリガーが app_users / now() から写すので、ここでは渡さない。
 */
export async function applyForCreatorAction(
  _prevState: CreatorApplyActionState,
  formData: FormData,
): Promise<CreatorApplyActionState> {
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
  if (!user.phoneNumberVerified) {
    return { error: "先に SMS で電話番号の認証を済ませてください" };
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
    if (error.message.includes("phone_not_verified")) {
      return { error: "先に SMS で電話番号の認証を済ませてください" };
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

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { demoGuestEnabled, safeGuestRedirect } from "./demo-mode";
import { getOptionalUser } from "./guards";
import { authMutation } from "@/lib/auth/mutation";

/** メールとパスワードで登録し、10分間有効の6桁コードで確認する。 */
const signUpSchema = z
  .object({
    displayName: z.string().min(1, "表示名を入力してください").max(50),
    email: z.email("メールアドレスの形式が正しくありません"),
    password: z.string().min(8, "パスワードは8文字以上で入力してください"),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

const signInSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const verifySchema = z.object({
  email: z.email(),
  token: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
});

export type AuthActionState = {
  error: string | null;
};

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { displayName, email, password } = parsed.data;

  const { error } = await authMutation("/sign-up/email", {
    name: displayName,
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/signup/verify?email=${encodeURIComponent(email)}`);
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { error } = await authMutation("/sign-in/email", parsed.data);

  if (error) {
    // 未確認のアカウントは登録の続きへ戻す（コードの入力が残っているだけなので）
    if (error.code === "EMAIL_NOT_VERIFIED") {
      redirect(`/signup/verify?email=${encodeURIComponent(parsed.data.email)}`);
    }
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  const redirectTo = formData.get("redirect");
  redirect(
    typeof redirectTo === "string" &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//") &&
      !redirectTo.includes("\\")
      ? redirectTo
      : "/",
  );
}

/** 確認コードを検証する。通ればそのままログイン状態になる。 */
export async function verifySignUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "確認コードを入力してください",
    };
  }

  const { error } = await authMutation("/email-otp/verify-email", {
    email: parsed.data.email,
    otp: parsed.data.token,
  });

  if (error) {
    return { error: "確認コードが正しくないか、有効期限が切れています" };
  }

  redirect("/");
}

/** 確認コードの再送。認証ライブラリのDBレート制限を通す。 */
export async function resendSignUpCodeAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return {
      error: "メールアドレスが分かりません。最初からやり直してください",
    };
  }

  const { error } = await authMutation("/email-otp/send-verification-otp", {
    type: "email-verification",
    email,
  });

  if (error) {
    return { error: "しばらく待ってから再送してください" };
  }
  return { error: null };
}

export async function signOutAction() {
  await authMutation("/sign-out", {});
  redirect("/");
}


export async function enterGuestAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!demoGuestEnabled()) return { error: "ゲスト利用はこの環境では無効です" };
  const { user } = await getOptionalUser();
  if (!user) {
    const { error } = await authMutation("/sign-in/anonymous", {});
    if (error) return { error: error.status === 429 ? "少し待ってから、もう一度お試しください" : "ゲストアカウントを準備できませんでした" };
  }
  redirect(safeGuestRedirect(formData.get("redirect")));
}

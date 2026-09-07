"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * 新規登録は「メールアドレス＋パスワード2回 → 6桁の確認コード」方式。
 * コードは10分で無効、再送は60秒間隔（supabase/config.toml の
 * otp_expiry / max_frequency と、confirmation.html の {{ .Token }} で成立させている）。
 */
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
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const { displayName, email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/signup/verify?email=${encodeURIComponent(email)}`);
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // 未確認のアカウントは登録の続きへ戻す（コードの入力が残っているだけなので）
    if (error.code === "email_not_confirmed") {
      redirect(`/signup/verify?email=${encodeURIComponent(parsed.data.email)}`);
    }
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  const redirectTo = formData.get("redirect");
  redirect(typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/");
}

/** 確認コードを検証する。通ればそのままログイン状態になる。 */
export async function verifySignUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "確認コードを入力してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "signup",
  });

  if (error) {
    return { error: "確認コードが正しくないか、有効期限が切れています" };
  }

  redirect("/");
}

/** 確認コードの再送。間隔の制限は Supabase 側（max_frequency）が持つ。 */
export async function resendSignUpCodeAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { error: "メールアドレスが分かりません。最初からやり直してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    return { error: "しばらく待ってから再送してください" };
  }
  return { error: null };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

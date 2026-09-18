import Link from "next/link";
import { redirect } from "next/navigation";

import { VerifyForm } from "@/components/auth/verify-form";

export const metadata = { title: "確認コードの入力" };

/**
 * Figma ⓪共通「確認コードの入力 2167:2034」。
 * 新規登録で送った6桁のコードを入れて登録を完了する。
 */
export default async function VerifySignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email) redirect("/login?mode=signup");

  return (
    <div className="flex flex-1 items-center justify-center bg-ground px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-4 sm:p-7">
        <Link href="/" className="text-xl font-bold text-brand">
          OshiNest
        </Link>
        <h1 className="mt-4 text-lg font-bold text-ink">確認コードを入力</h1>
        <p className="mt-1 mb-6 text-[12.5px] leading-5 text-muted-foreground">
          <span className="break-all font-medium text-ink">{email}</span> に6桁のコードを送りました。
          10分以内に入力してください。
        </p>

        <VerifyForm email={email} />

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          アドレスを間違えた場合は{" "}
          <Link href="/login?mode=signup" className="text-brand hover:underline">
            登録し直す
          </Link>
        </p>
      </div>
    </div>
  );
}

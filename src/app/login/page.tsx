import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">ログイン</h1>
          <p className="text-sm text-muted-foreground">
            メールアドレスまたはGoogleアカウントでログインします
          </p>
        </div>
        <LoginForm next={next ?? "/mypage"} />
      </div>
    </div>
  );
}

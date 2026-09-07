import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-8 py-4">
        <span className="text-xl font-bold text-primary">Osinest</span>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <Link href="/mypage" className="hover:text-primary">
              マイページ
            </Link>
          ) : (
            <>
              <Link href="/login" className="hover:text-primary">
                ログイン
              </Link>
              <Button asChild size="sm">
                <Link href="/signup">新規登録</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 bg-secondary px-6 text-center">
        <h1 className="text-3xl font-bold">推し活特化型3Dプリント受託販売EC「Osinest」</h1>
        <p className="max-w-xl text-muted-foreground">
          クリエイターの3Dデータをもとに、運営が印刷・検品・発送まで代行。あなたの推しぬいにぴったりの空間を。
        </p>
      </section>
    </main>
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * RSC / Server Action / Route Handler の通常処理で使う。
 * anon key + リクエストの Cookie セッションで RLS が効く。
 *
 * Server Component からは Cookie を書き換えられないため、その場合の
 * setAll 失敗は無視してよい（middleware がセッションのリフレッシュを担う）。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component から呼ばれた場合は Cookie を書き換えられない。
            // middleware がセッションのリフレッシュを行うため無視してよい。
          }
        },
      },
    }
  );
}

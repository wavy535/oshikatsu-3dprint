import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * service_role は RLS を貫通する。呼び出し側で必ず権限判定を済ませてから
 * 使うこと。「ユーザーの入力値をそのまま where 条件に使う」ような使い方は禁止。
 *
 * 用途: Stripe Webhook、STL署名URL発行、cron、Admin操作の一部など
 * ユーザー文脈が無い/RLSを意図的にバイパスする必要がある処理のみ。
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

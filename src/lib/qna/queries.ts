import "server-only";

import { createClient } from "@/lib/supabase/server";

/** 作品の Q&A（公開）。回答済みを先に、新しい順。 */
export async function listWorkQna(workId: string) {
  const supabase = await createClient();
  const [{ data: threads }, { data: rule }] = await Promise.all([
    supabase
      .from("qna_threads")
      .select("id, question, answer, answered_at, created_at, asker_id, profiles!qna_threads_asker_id_fkey(display_name)")
      .eq("work_id", workId)
      .order("created_at", { ascending: false }),
    supabase.from("print_pricing_rules").select("shipping_fee_jpy").eq("is_active", true).maybeSingle(),
  ]);
  return { threads: threads ?? [], shippingFee: rule?.shipping_fee_jpy ?? null };
}

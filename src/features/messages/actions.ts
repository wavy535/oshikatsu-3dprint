"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  sendMessageSchema,
  startPrePurchaseThreadSchema,
  type SendMessageInput,
  type StartPrePurchaseThreadInput,
} from "./schema";

export async function sendMessage(input: SendMessageInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: thread } = await supabase
    .from("message_threads")
    .select("is_closed")
    .eq("id", v.threadId)
    .single();
  if (!thread) return { ok: false, error: "スレッドが見つかりません" };
  if (thread.is_closed) return { ok: false, error: "このスレッドはクローズされています" };

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: v.threadId, sender_id: user.id, body: v.body });
  if (error) return { ok: false, error: "送信に失敗しました" };

  revalidatePath(`/mypage/messages/${v.threadId}`);
  revalidatePath(`/studio/messages/${v.threadId}`);
  return { ok: true, data: undefined };
}

export async function startPrePurchaseThread(
  input: StartPrePurchaseThreadInput
): Promise<ActionResult<{ threadId: string }>> {
  const { supabase, user } = await requireUser();

  const parsed = startPrePurchaseThreadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: product } = await supabase
    .from("products")
    .select("id, title, creator_id")
    .eq("id", v.productId)
    .single();
  if (!product) return { ok: false, error: "作品が見つかりません" };
  if (product.creator_id === user.id) {
    return { ok: false, error: "自分の作品には質問できません" };
  }

  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("kind", "pre_purchase")
    .eq("buyer_id", user.id)
    .eq("creator_id", product.creator_id)
    .eq("product_id", v.productId)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: created, error } = await supabase
      .from("message_threads")
      .insert({
        kind: "pre_purchase",
        buyer_id: user.id,
        creator_id: product.creator_id,
        product_id: v.productId,
        subject: `「${product.title}」について`,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: "スレッドの作成に失敗しました" };
    threadId = created.id;
  }

  const { error: msgError } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: user.id, body: v.body });
  if (msgError) return { ok: false, error: "送信に失敗しました" };

  revalidatePath("/mypage/messages");
  return { ok: true, data: { threadId } };
}

export async function markThreadRead(threadId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: thread } = await supabase
    .from("message_threads")
    .select("buyer_id, creator_id")
    .eq("id", threadId)
    .single();
  if (!thread) return { ok: false, error: "スレッドが見つかりません" };

  const update =
    thread.buyer_id === user.id
      ? { buyer_unread_count: 0 }
      : thread.creator_id === user.id
        ? { creator_unread_count: 0 }
        : null;
  if (!update) return { ok: false, error: "権限がありません" };

  const { error } = await supabase.from("message_threads").update(update).eq("id", threadId);
  if (error) return { ok: false, error: "既読化に失敗しました" };

  return { ok: true, data: undefined };
}

export async function closeThread(threadId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("message_threads")
    .update({ is_closed: true })
    .eq("id", threadId);
  if (error) return { ok: false, error: "クローズに失敗しました" };

  revalidatePath(`/mypage/messages/${threadId}`);
  revalidatePath(`/studio/messages/${threadId}`);
  return { ok: true, data: undefined };
}

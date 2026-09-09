"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";

import { requireUser } from "@/lib/auth/guards";

export type MessageActionState = { error: string | null; sentAt?: number };

/** Only messages rendered for this recipient may be marked; never mutate on GET/prefetch. */
export async function markMessagesReadAction(ids: string[]) {
  const valid = z.array(idSchema).min(1).max(50).parse(ids);
  const { db, user } = await requireUser("/mypage/messages");
  const result = await db
    .updateTable("messages")
    .set({ read_at: new Date().toISOString() })
    .where("recipient_id", "=", user.id)
    .where("id", "in", valid)
    .where("read_at", "is", null)
    .executeTakeFirst();
  if (result.numUpdatedRows > BigInt(0)) revalidatePath("/mypage/messages");
}

const schema = z.object({
  recipientId: idSchema,
  body: z
    .string()
    .trim()
    .min(1, "メッセージを入力してください")
    .max(2000, "2000文字までです"),
  orderId: idSchema.optional(),
});

/** メッセージ送信。相手への通知はトリガーが出す（設計判断2）。 */
export async function sendMessageAction(
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const parsed = schema.safeParse({
    recipientId: formData.get("recipientId"),
    body: formData.get("body"),
    orderId: String(formData.get("orderId") ?? "") || undefined,
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };

  const { db, user } = await requireUser("/mypage/messages");
  if (parsed.data.recipientId === user.id)
    return { error: "自分にはメッセージを送れません" };

  const { data, error } = await queryResult(
    db
      .insertInto("messages")
      .values({
        sender_id: user.id,
        recipient_id: parsed.data.recipientId,
        body: parsed.data.body,
        order_id: parsed.data.orderId ?? null,
      })
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: `送信に失敗しました（${error?.message ?? "0件"}）` };

  revalidatePath("/mypage/messages");
  return { error: null, sentAt: Date.now() };
}

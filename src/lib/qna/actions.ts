"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { idSchema } from "@/lib/validation";

export type QnaActionState = { error: string | null; message?: string };

const askSchema = z.object({
  workId: idSchema,
  question: z
    .string()
    .trim()
    .min(5, "質問は5文字以上で書いてください")
    .max(500),
});

/** 質問する。公開される。クリエイターへの通知はトリガーが出す。 */
export async function askQuestionAction(
  _prev: QnaActionState,
  formData: FormData,
): Promise<QnaActionState> {
  const parsed = askSchema.safeParse({
    workId: formData.get("workId"),
    question: formData.get("question"),
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };

  const { db, user } = await requireUser(`/works/${parsed.data.workId}/qa`);
  const { data, error } = await queryResult(
    db
      .insertInto("qna_threads")
      .values({
        work_id: parsed.data.workId,
        asker_id: user.id,
        question: parsed.data.question,
      })
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: `質問を送れませんでした（${error?.message ?? "0件"}）` };

  revalidatePath(`/works/${parsed.data.workId}/qa`);
  return {
    error: null,
    message: "質問を投稿しました。回答が付くと通知が届きます",
  };
}

const answerSchema = z.object({
  threadId: idSchema,
  workId: idSchema,
  answer: z.string().trim().min(1, "回答を入力してください").max(2000),
});

/** 回答する（作品のクリエイターだけ。RLS が最終的に止める）。 */
export async function answerQuestionAction(
  _prev: QnaActionState,
  formData: FormData,
): Promise<QnaActionState> {
  const parsed = answerSchema.safeParse({
    threadId: formData.get("threadId"),
    workId: formData.get("workId"),
    answer: formData.get("answer"),
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };

  const { db } = await requireUser(`/works/${parsed.data.workId}/qa`);
  const { data, error } = await queryResult(
    db
      .updateTable("qna_threads")
      .set({
        answer: parsed.data.answer,
        answered_at: new Date().toISOString(),
      })
      .where("qna_threads.id", "=", parsed.data.threadId)
      .returning(["id"])
      .execute(),
  );
  if (error) return { error: `回答を保存できませんでした（${error.message}）` };
  if (!data || data.length === 0)
    return {
      error:
        "この質問には回答できません（作品のクリエイターだけが回答できます）",
    };

  revalidatePath(`/works/${parsed.data.workId}/qa`);
  return { error: null, message: "回答を投稿しました" };
}

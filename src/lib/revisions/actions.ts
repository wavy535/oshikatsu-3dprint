"use server";
import { queryResult } from "@/lib/db/result";
import { sql } from "kysely";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";

import { requireCreator } from "@/lib/auth/guards";
import type { RevisionResolution } from "@/types/db";

export type RevisionActionState = { error: string | null; message?: string };

const OK: RevisionActionState = { error: null };

function revalidate(id: string) {
  revalidatePath("/studio/revisions");
  revalidatePath(`/studio/revisions/${id}`);
  revalidatePath("/studio/works");
}

const resolutionSchema = z.enum([
  "reupload",
  "instruction",
  "unlist",
  "no_action",
]);

/**
 * 対応方法を選んで「対応中」にする。
 * 「出品停止」を選んだときはその場で対応済み（is_listed は open のときに
 * トリガーが既に false にしている。再出品はクリエイターが自分で戻す）。
 */
export async function startRevisionAction(
  _prev: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const id = String(formData.get("id") ?? "");
  const parsed = resolutionSchema.safeParse(formData.get("resolution"));
  if (!id || !parsed.success) return { error: "対応方法を選んでください" };
  const resolution: RevisionResolution = parsed.data;

  const { db, user } = await requireCreator();
  const unlist = resolution === "unlist";

  const { data, error } = await queryResult(
    db
      .updateTable("revision_requests")
      .set({
        status: unlist ? "resolved" : "in_progress",
        resolution,
        resolved_at: unlist ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .where("revision_requests.id", "=", id)
      .where("revision_requests.creator_id", "=", user.id)
      .where(
        sql<boolean>`${sql.ref("revision_requests.status")} = any(${["open", "in_progress", "disputed"]})`,
      )
      .returning(["id"])
      .execute(),
  );

  if (error) return { error: `更新に失敗しました（${error.message}）` };
  if (!data || data.length === 0)
    return { error: "この修正依頼は更新できません" };

  revalidate(id);
  return {
    error: null,
    message: unlist ? "このサイズを出品停止にしました" : "対応中にしました",
  };
}

const resolveSchema = z.object({
  id: idSchema,
  note: z.string().max(1000).optional(),
  relist: z.boolean(),
});

/**
 * 対応済みにする。データ差し替え／指示の変更が終わったあとに押す。
 * 「再出品する」を選んだら work_variants.is_listed を戻す（トリガーは自動で戻さない）。
 */
export async function resolveRevisionAction(
  _prev: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const parsed = resolveSchema.safeParse({
    id: formData.get("id"),
    note: String(formData.get("note") ?? "").trim() || undefined,
    relist: formData.get("relist") === "on",
  });
  if (!parsed.success) return { error: "入力内容を確認してください" };
  const { id, note, relist } = parsed.data;

  const { db, user } = await requireCreator();

  const { data: current } = await queryResult(
    db
      .selectFrom("revision_requests")
      .select([
        "revision_requests.resolution",
        "revision_requests.variant_id",
        "revision_requests.status",
      ])
      .where("revision_requests.id", "=", id)
      .where("revision_requests.creator_id", "=", user.id)
      .executeTakeFirst(),
  );
  if (!current) return { error: "修正依頼が見つかりません" };
  if (current.status === "resolved") return { error: "すでに対応済みです" };
  if (!current.resolution) return { error: "先に対応方法を選んでください" };

  const { data, error } = await queryResult(
    db
      .updateTable("revision_requests")
      .set({
        status: "resolved",
        resolution_note: note ?? null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where("revision_requests.id", "=", id)
      .where("revision_requests.creator_id", "=", user.id)
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: "更新できませんでした" };

  if (relist && current.variant_id && current.resolution !== "unlist") {
    const { data: v, error: vError } = await queryResult(
      db
        .updateTable("work_variants")
        .set({ is_listed: true })
        .where("work_variants.id", "=", current.variant_id)
        .returning(["id"])
        .execute(),
    );
    if (vError)
      return {
        error: null,
        message: `対応済みにしましたが再出品できませんでした（${vError.message}）`,
      };
    if (!v || v.length === 0)
      return {
        error: null,
        message: "対応済みにしましたが再出品できませんでした",
      };
  }

  revalidate(id);
  return {
    ...OK,
    message: relist ? "対応済みにして再出品しました" : "対応済みにしました",
  };
}

/** 判定に納得できないとき。運営に相談中にする（相談の本文はメッセージで）。 */
export async function disputeRevisionAction(
  _prev: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return { error: "修正依頼が指定されていません" };
  if (note.length < 10)
    return { error: "相談内容を10文字以上で書いてください" };

  const { db, user } = await requireCreator();
  const { data, error } = await queryResult(
    db
      .updateTable("revision_requests")
      .set({
        status: "disputed",
        resolution_note: note,
        updated_at: new Date().toISOString(),
      })
      .where("revision_requests.id", "=", id)
      .where("revision_requests.creator_id", "=", user.id)
      .where(
        sql<boolean>`${sql.ref("revision_requests.status")} = any(${["open", "in_progress"]})`,
      )
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: "更新できませんでした" };

  revalidate(id);
  return { ...OK, message: "運営に相談中にしました。運営から連絡します" };
}

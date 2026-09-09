"use server";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";

export type ReviewActionState = { error: string | null; ok?: boolean };

/**
 * 受け取り評価。クリエイターあて（必須3軸＋総合）と運営あて（任意3軸）を
 * 同じ行の別の列に持つ。クリエイターの星に運営への評価が混ざらないよう、
 * 集計は creator_rating_summary / ops_rating_summary が分けて見る。
 */
const reviewSchema = z.object({
  orderItemId: z.uuid(),
  rating: z.coerce.number().int().min(1, "総合評価を選んでください").max(5),
  designRating: z.coerce.number().int().min(1).max(5),
  accuracyRating: z.coerce.number().int().min(1).max(5),
  sizeFitRating: z.coerce.number().int().min(1).max(5),
  printQualityRating: z.coerce.number().int().min(1).max(5).optional(),
  packagingRating: z.coerce.number().int().min(1).max(5).optional(),
  shippingRating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  isAnonymous: z.boolean(),
});

export async function submitReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const opt = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };

  const parsed = reviewSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    designRating: formData.get("designRating"),
    accuracyRating: formData.get("accuracyRating"),
    sizeFitRating: formData.get("sizeFitRating"),
    printQualityRating: opt("printQualityRating"),
    packagingRating: opt("packagingRating"),
    shippingRating: opt("shippingRating"),
    comment: opt("comment"),
    isAnonymous: formData.get("isAnonymous") === "on",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "評価の入力を確認してください",
    };
  }

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  // 自分が買った明細か、注文が完了しているかを確認してから書く
  const { data: item } = await queryResult(
    db
      .selectFrom("order_items")
      .select((eb) => [
        "order_items.id",
        "order_items.work_id",
        "order_items.creator_id",
        jsonObjectFrom(
          eb
            .selectFrom("orders as r0")
            .select(["r0.buyer_id", "r0.status"])
            .whereRef("r0.id", "=", "order_items.order_id"),
        )
          .$notNull()
          .as("orders"),
      ])
      .where("order_items.id", "=", parsed.data.orderItemId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("orders as r0")
            .select(["r0.buyer_id", "r0.status"])
            .whereRef("r0.id", "=", "order_items.order_id")
            .clearSelect()
            .select("r0.id"),
        ),
      )
      .executeTakeFirst(),
  );

  if (!item || item.orders.buyer_id !== user.id)
    return { error: "対象の注文が見つかりません" };
  if (item.orders.status !== "completed") {
    return { error: "受け取りが完了してから評価できます" };
  }

  const { data, error } = await queryResult(
    db
      .insertInto("reviews")
      .values({
        order_item_id: item.id,
        reviewer_id: user.id,
        work_id: item.work_id,
        creator_id: item.creator_id,
        rating: parsed.data.rating,
        design_rating: parsed.data.designRating,
        accuracy_rating: parsed.data.accuracyRating,
        size_fit_rating: parsed.data.sizeFitRating,
        print_quality_rating: parsed.data.printQualityRating ?? null,
        packaging_rating: parsed.data.packagingRating ?? null,
        shipping_rating: parsed.data.shippingRating ?? null,
        comment: parsed.data.comment ?? null,
        is_anonymous: parsed.data.isAnonymous,
      })
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0) {
    return {
      error: "評価を保存できませんでした（すでに投稿済みかもしれません）",
    };
  }

  revalidatePath("/mypage/orders");
  revalidatePath(`/works/${item.work_id}`);
  return { error: null, ok: true };
}

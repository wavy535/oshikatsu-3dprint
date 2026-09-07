"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireCreator, requireAdmin } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import {
  createReviewSchema,
  updateReviewSchema,
  replyToReviewSchema,
  hideReviewSchema,
  serviceReviewSchema,
  type CreateReviewInput,
  type UpdateReviewInput,
  type ReplyToReviewInput,
  type HideReviewInput,
  type ServiceReviewInput,
} from "./schema";

export async function createReview(input: CreateReviewInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = createReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: item } = await supabase
    .from("order_items")
    .select("product_id, order_id")
    .eq("id", v.orderItemId)
    .single();
  if (!item) return { ok: false, error: "対象の注文明細が見つかりません" };

  // DESIGN.md §8.3: reviews_insert_purchased ポリシーが「completed の自分の注文」であることを
  // DB側でも検証するため、ここでの取りこぼしは RLS 違反エラーとして返る。
  const { error } = await supabase.from("reviews").insert({
    order_item_id: v.orderItemId,
    product_id: item.product_id,
    user_id: user.id,
    rating: v.rating,
    rating_design: v.ratingDesign ?? null,
    rating_accuracy: v.ratingAccuracy ?? null,
    rating_size: v.ratingSize ?? null,
    title: v.title || null,
    body: v.body || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "この明細には既にレビュー済みです" };
    return { ok: false, error: "受取完了した注文のみレビューできます" };
  }

  revalidatePath("/mypage/orders");
  revalidatePath(`/mypage/orders/${item.order_id}`);
  return { ok: true, data: undefined };
}

export async function updateReview(input: UpdateReviewInput): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const parsed = updateReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { data: review } = await supabase
    .from("reviews")
    .select("order_items(order_id)")
    .eq("id", v.reviewId)
    .single();

  const { error } = await supabase
    .from("reviews")
    .update({
      rating: v.rating,
      rating_design: v.ratingDesign ?? null,
      rating_accuracy: v.ratingAccuracy ?? null,
      rating_size: v.ratingSize ?? null,
      title: v.title || null,
      body: v.body || null,
    })
    .eq("id", v.reviewId);
  if (error) return { ok: false, error: "投稿から14日を過ぎたレビューは編集できません" };

  revalidatePath("/mypage/orders");
  if (review?.order_items?.order_id) revalidatePath(`/mypage/orders/${review.order_items.order_id}`);
  return { ok: true, data: undefined };
}

/**
 * 運営あての評価（印刷・梱包・配送）。Figma 61:153 の 2 段目。
 * service_reviews は products.review_avg の集計対象ではないので、
 * ここでの点数がクリエイターの星に混ざることはない。
 */
export async function upsertServiceReview(
  input: ServiceReviewInput
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = serviceReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase.from("service_reviews").upsert(
    {
      order_id: v.orderId,
      user_id: user.id,
      rating_print: v.ratingPrint,
      rating_packing: v.ratingPacking,
      rating_delivery: v.ratingDelivery,
      comment: v.comment || null,
    },
    { onConflict: "order_id" }
  );
  if (error) {
    return { ok: false, error: "受取完了した自分の注文のみ評価できます" };
  }

  revalidatePath(`/mypage/orders/${v.orderId}`);
  return { ok: true, data: undefined };
}

export async function deleteReview(reviewId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { data: review } = await supabase
    .from("reviews")
    .select("order_items(order_id)")
    .eq("id", reviewId)
    .single();

  const { error } = await supabase
    .from("reviews")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) return { ok: false, error: "投稿から14日を過ぎたレビューは削除できません" };

  revalidatePath("/mypage/orders");
  if (review?.order_items?.order_id) revalidatePath(`/mypage/orders/${review.order_items.order_id}`);
  return { ok: true, data: undefined };
}

export async function replyToReview(input: ReplyToReviewInput): Promise<ActionResult> {
  const { supabase } = await requireCreator();

  const parsed = replyToReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("reviews")
    .update({ creator_reply: v.body })
    .eq("id", v.reviewId);
  if (error) return { ok: false, error: "自作品のレビューにのみ返信できます" };

  revalidatePath("/studio/reviews");
  return { ok: true, data: undefined };
}

export async function hideReview(input: HideReviewInput): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = hideReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const { error } = await supabase.from("reviews").update({ is_public: false }).eq("id", v.reviewId);
  if (error) return { ok: false, error: "非公開化に失敗しました" };

  revalidatePath("/admin/reviews");
  return { ok: true, data: undefined };
}

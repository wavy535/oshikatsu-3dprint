import { z } from "zod";

const star = z.number().int().min(1).max(5);

// DESIGN.md §4.4.5 reviews の check 制約 + Figma 61:153 の 3 軸内訳
export const createReviewSchema = z.object({
  orderItemId: z.string().uuid(),
  rating: star,
  ratingDesign: star.optional(),
  ratingAccuracy: star.optional(),
  ratingSize: star.optional(),
  title: z.string().max(60).optional().or(z.literal("")),
  body: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateReviewInput = z.input<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  reviewId: z.string().uuid(),
  rating: star,
  ratingDesign: star.optional(),
  ratingAccuracy: star.optional(),
  ratingSize: star.optional(),
  title: z.string().max(60).optional().or(z.literal("")),
  body: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateReviewInput = z.input<typeof updateReviewSchema>;

/**
 * 運営あての評価（印刷・梱包・配送）。任意入力で、
 * クリエイターの星（products.review_avg）には一切反映されない。
 */
export const serviceReviewSchema = z.object({
  orderId: z.string().uuid(),
  ratingPrint: star,
  ratingPacking: star,
  ratingDelivery: star,
  comment: z.string().max(2000).optional().or(z.literal("")),
});
export type ServiceReviewInput = z.input<typeof serviceReviewSchema>;

export const replyToReviewSchema = z.object({
  reviewId: z.string().uuid(),
  body: z.string().min(1).max(1000),
});
export type ReplyToReviewInput = z.input<typeof replyToReviewSchema>;

export const hideReviewSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.string().max(500).optional().or(z.literal("")),
});
export type HideReviewInput = z.input<typeof hideReviewSchema>;

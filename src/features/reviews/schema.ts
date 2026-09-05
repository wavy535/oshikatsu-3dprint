import { z } from "zod";

// DESIGN.md §4.4.5 reviews の check 制約に準拠
export const createReviewSchema = z.object({
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(60).optional().or(z.literal("")),
  body: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateReviewInput = z.input<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  reviewId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(60).optional().or(z.literal("")),
  body: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateReviewInput = z.input<typeof updateReviewSchema>;

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

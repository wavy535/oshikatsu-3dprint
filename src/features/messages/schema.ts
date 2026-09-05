import { z } from "zod";

// DESIGN.md §4.4.6 messages の check 制約に準拠
export const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const startPrePurchaseThreadSchema = z.object({
  productId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});
export type StartPrePurchaseThreadInput = z.input<typeof startPrePurchaseThreadSchema>;

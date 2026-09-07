import { z } from "zod";

/** Figma ③ オーダーメイド相談フォーム（48:900） */
export const createCustomOrderSchema = z.object({
  productId: z.string().uuid(),
  nuiSizeId: z.number().int().optional(),
  colorNote: z.string().max(500).optional(),
  finishNote: z.string().max(500).optional(),
  requestNote: z
    .string()
    .min(1, "希望の内容を書いてください")
    .max(2000),
  desiredDate: z.string().optional(),
});
export type CreateCustomOrderInput = z.input<typeof createCustomOrderSchema>;

/** Figma ③ 見積り・お支払い（2096:1389）でクリエイターが返す内容 */
export const submitQuoteSchema = z.object({
  customOrderId: z.string().uuid(),
  quotePrice: z.number().int().min(100).max(500_000),
  quoteFilamentG: z.number().int().min(0).max(100_000).optional(),
  quotePrintMin: z.number().int().min(0).max(100_000).optional(),
  quotePartCount: z.number().int().min(1).max(200).optional(),
  quoteLeadDays: z.number().int().min(1).max(180),
  quoteSpec: z.string().max(2000).optional(),
  quoteNote: z.string().max(2000).optional(),
});
export type SubmitQuoteInput = z.input<typeof submitQuoteSchema>;

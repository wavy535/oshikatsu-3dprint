import { z } from "zod";

export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  filamentId: z.number().int(),
  nuiSizeId: z.number().int().optional(),
  quantity: z.number().int().min(1).max(20).default(1),
});
export type AddToCartInput = z.input<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});
export type UpdateCartItemInput = z.input<typeof updateCartItemSchema>;

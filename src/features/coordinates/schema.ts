import { z } from "zod";

// DESIGN.md §4.4.4 coordinates の check 制約に準拠
export const upsertCoordinateSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(60),
  body: z.string().max(2000).optional().or(z.literal("")),
  userNuiId: z.string().uuid().optional().or(z.literal("")),
  nuiSizeId: z.number().int().optional(),
  isPublic: z.boolean(),
});
export type UpsertCoordinateInput = z.input<typeof upsertCoordinateSchema>;

export const setCoordinateItemsSchema = z.object({
  coordinateId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        pinX: z.number().min(0).max(1).optional(),
        pinY: z.number().min(0).max(1).optional(),
        note: z.string().max(200).optional().or(z.literal("")),
      })
    )
    .max(20),
});
export type SetCoordinateItemsInput = z.input<typeof setCoordinateItemsSchema>;

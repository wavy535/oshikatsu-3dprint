import { z } from "zod";

// DESIGN.md §4.4.1 user_nuis の check 制約に準拠
export const upsertNuiSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(30),
  nuiSizeId: z.number().int(),
  customHeightMm: z.number().int().min(10).max(1000).optional(),
  note: z.string().max(300).optional().or(z.literal("")),
});
export type UpsertNuiInput = z.input<typeof upsertNuiSchema>;

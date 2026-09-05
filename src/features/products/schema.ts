import { z } from "zod";

// DESIGN.md §6.2 の createProductSchema をそのまま採用
export const createProductSchema = z
  .object({
    title: z.string().min(1).max(80),
    description: z.string().max(5000),
    categoryId: z.number().int().positive(),
    basePrice: z.number().int().min(100).max(500_000),
    nuiSizeIds: z.array(z.number().int()).min(1, "対応サイズを1つ以上選択してください"),
    tagIds: z.array(z.number().int()).max(10),
    filamentIds: z.array(z.number().int()).min(1),
    defaultFilamentId: z.number().int(),
    sizeWMm: z.number().int().positive().optional(),
    sizeDMm: z.number().int().positive().optional(),
    sizeHMm: z.number().int().positive().optional(),
    estWeightG: z.number().int().positive().optional(),
    printNote: z.string().max(2000).optional(),
  })
  .refine((v) => v.filamentIds.includes(v.defaultFilamentId), {
    message: "既定フィラメントは選択肢に含めてください",
    path: ["defaultFilamentId"],
  });
export type CreateProductInput = z.input<typeof createProductSchema>;

// 更新も同じ入力形状（編集フォームは全項目を送り直す）
export const updateProductSchema = createProductSchema;
export type UpdateProductInput = z.input<typeof updateProductSchema>;

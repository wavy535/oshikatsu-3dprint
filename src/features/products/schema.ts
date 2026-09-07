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

// ───────── 作品投稿 4STEP（Figma ② 出品フロー）─────────

/** STEP2: パーツごとの印刷指示 */
export const printInstructionsSchema = z.object({
  productId: z.string().uuid(),
  parts: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        partLabel: z.string().max(60).optional(),
        quantityPerItem: z.number().int().min(1).max(50),
        layerDirection: z.enum(["z_up", "z_down", "x_flat", "auto"]),
        supportType: z.enum(["none", "normal", "tree", "auto"]),
        colorSlot: z.number().int().min(1).max(8).optional(),
        filamentId: z.number().int().optional(),
        printNote: z.string().max(500).optional(),
      })
    )
    .min(1, "3Dデータを1つ以上アップロードしてください"),
});
export type PrintInstructionsInput = z.input<typeof printInstructionsSchema>;

/** STEP3: 作品情報とサイズ展開（サイズごとの価格・在庫） */
export const productInfoSchema = z
  .object({
    productId: z.string().uuid(),
    title: z.string().min(1, "作品名を入力してください").max(80),
    description: z.string().max(5000),
    categoryId: z.number().int().positive(),
    tagIds: z.array(z.number().int()).max(10),
    filamentIds: z.array(z.number().int()).min(1, "色を1つ以上選択してください"),
    defaultFilamentId: z.number().int(),
    printNote: z.string().max(2000).optional(),
    variants: z
      .array(
        z.object({
          nuiSizeId: z.number().int(),
          price: z.number().int().min(100).max(500_000),
          stock: z.number().int().min(0).max(9999),
          isActive: z.boolean(),
        })
      )
      .min(1),
  })
  .refine((v) => v.filamentIds.includes(v.defaultFilamentId), {
    message: "既定の色は選択肢に含めてください",
    path: ["defaultFilamentId"],
  })
  .refine((v) => v.variants.some((s) => s.isActive), {
    message: "出品するサイズを1つ以上選んでください",
    path: ["variants"],
  });
export type ProductInfoInput = z.input<typeof productInfoSchema>;

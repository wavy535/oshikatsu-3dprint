import { z } from "zod";

/** Figma ④ 運営｜検品・発送登録（2083:1233）の 6 項目 */
export const INSPECTION_ITEMS = [
  { key: "dimension", label: "寸法どおりか" },
  { key: "surface", label: "表面の荒れ・層ズレがないか" },
  { key: "support", label: "サポート跡がきれいに除去されているか" },
  { key: "parts", label: "パーツが揃っているか" },
  { key: "assembly", label: "仮組みできるか" },
  { key: "color", label: "指定の色・素材か" },
] as const;

export type InspectionItemKey = (typeof INSPECTION_ITEMS)[number]["key"];

export const completePrintJobSchema = z.object({
  jobId: z.string().uuid(),
  actualWeightG: z.number().int().min(0).max(100_000),
  actualPrintMin: z.number().int().min(0).max(100_000),
  actualFilamentId: z.number().int().optional(),
  note: z.string().max(2000).optional(),
});
export type CompletePrintJobInput = z.input<typeof completePrintJobSchema>;

export const recordInspectionSchema = z
  .object({
    jobId: z.string().uuid(),
    result: z.enum(["pass", "fail_model", "fail_print"]),
    checks: z.record(z.string(), z.boolean()),
    comment: z.string().max(2000).optional(),
    /** NG がモデル側のときだけ、クリエイターへ請求する再印刷代行費 */
    reprintFee: z.number().int().min(0).max(500_000).optional(),
  })
  .refine((v) => v.result !== "fail_model" || (v.comment ?? "").length > 0, {
    message: "モデル側NGのときは、何がNGかをコメントに書いてください",
    path: ["comment"],
  });
export type RecordInspectionInput = z.input<typeof recordInspectionSchema>;

import { z } from "zod";
export const programIds = ["model-1", "model-2", "model-3"] as const;
export const programSchema = z.object({
  id: z.enum(programIds), name: z.string().trim().min(1).max(40),
  x: z.number().finite().min(0).max(400), y: z.number().finite().min(0).max(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.array(z.number().finite().min(2).max(200)).length(3),
  source: z.string().min(1).max(12000),
}).strict();
export type ModelProgram = z.infer<typeof programSchema>;
export function programFootprint(p: ModelProgram) { return { ...p, width: p.size[0], depth: p.size[1], height: p.size[2] }; }

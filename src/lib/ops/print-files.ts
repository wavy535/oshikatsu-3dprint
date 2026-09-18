import { z } from "zod";

const schema = z.array(z.object({
  file_name: z.string(),
  storage_path: z.string().min(1),
  scale_ratio: z.coerce.number().positive().optional(),
}));

export function printFilesFromSnapshot(value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? result.data : [];
}

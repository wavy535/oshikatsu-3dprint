import { z } from "zod";

// DESIGN.md §4.4.1 profiles の check 制約に準拠
export const updateProfileSchema = z.object({
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, "半角英小文字・数字・_ を3〜20文字で入力してください"),
  displayName: z.string().min(1).max(50),
  bio: z.string().max(1000).optional().or(z.literal("")),
  emailOptIn: z.boolean(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

// DESIGN.md §4.4.1 creator_profiles に準拠
export const applyCreatorSchema = z.object({
  legalName: z.string().min(1).max(50),
  legalNameKana: z.string().min(1).max(50),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "生年月日を選択してください"),
  intro: z.string().max(2000).optional().or(z.literal("")),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
});
export type ApplyCreatorInput = z.input<typeof applyCreatorSchema>;

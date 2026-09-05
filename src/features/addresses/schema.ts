import { z } from "zod";

// DESIGN.md §4.4.1 shipping_addresses の check 制約に準拠
export const upsertAddressSchema = z.object({
  id: z.string().uuid().optional(),
  recipientName: z.string().min(1).max(50),
  postalCode: z.string().regex(/^\d{3}-?\d{4}$/, "郵便番号の形式が正しくありません"),
  prefecture: z.string().min(1),
  city: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional().or(z.literal("")),
  phone: z.string().regex(/^[0-9\-+]{10,15}$/, "電話番号の形式が正しくありません"),
});
export type UpsertAddressInput = z.input<typeof upsertAddressSchema>;

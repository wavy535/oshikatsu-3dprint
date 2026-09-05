import { z } from "zod";

export const reviewCreatorApplicationSchema = z.object({
  userId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});
export type ReviewCreatorApplicationInput = z.input<typeof reviewCreatorApplicationSchema>;

export const reviewProductSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});
export type ReviewProductInput = z.input<typeof reviewProductSchema>;

export const registerShipmentSchema = z.object({
  orderId: z.string().uuid(),
  carrier: z.enum(["yamato", "sagawa", "japanpost", "other"]),
  trackingNumber: z.string().min(1).max(50),
});
export type RegisterShipmentInput = z.input<typeof registerShipmentSchema>;

export const updateShipmentSchema = z.object({
  shipmentId: z.string().uuid(),
  carrier: z.enum(["yamato", "sagawa", "japanpost", "other"]),
  trackingNumber: z.string().min(1).max(50),
});
export type UpdateShipmentInput = z.input<typeof updateShipmentSchema>;

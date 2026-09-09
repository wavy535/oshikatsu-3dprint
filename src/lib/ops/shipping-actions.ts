"use server";

import { queryResult } from "@/lib/db/result";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/auth/guards";
import type { ShippingCarrier } from "@/types/db";
import type { OpsActionState } from "./action-state";

const shipmentSchema = z.object({
  orderId: idSchema,
  carrier: z.enum(["yamato", "sagawa", "japanpost", "other"]),
  serviceName: z.string().max(60).optional(),
  trackingNumber: z.string().min(4, "追跡番号を入れてください").max(60),
  boxType: z.string().max(60).optional(),
  weightGrams: z.coerce.number().int().min(0).max(50000),
  sizeSumCm: z.coerce.number().int().min(0).max(400),
  shippingFeeJpy: z.coerce.number().int().min(0).max(100000),
});

/**
 * 発送登録。1注文1件（同梱前提）。
 * 注文が「発送済み」になるのも購入者への通知も、DBのトリガーがやる（設計判断9）。
 */
export async function createShipmentAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = shipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    carrier: formData.get("carrier"),
    serviceName: String(formData.get("serviceName") ?? "") || undefined,
    trackingNumber: formData.get("trackingNumber"),
    boxType: String(formData.get("boxType") ?? "") || undefined,
    weightGrams: formData.get("weightGrams") || 0,
    sizeSumCm: formData.get("sizeSumCm") || 0,
    shippingFeeJpy: formData.get("shippingFeeJpy") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const v = parsed.data;

  const { db, user } = await requireAdmin();

  // 全ジョブが検品を通っていないうちは発送させない
  const { data: jobs } = await queryResult(
    db
      .selectFrom("print_jobs")
      .select(["print_jobs.status"])
      .where("print_jobs.order_id", "=", v.orderId)
      .execute(),
  );
  const pending = (jobs ?? []).filter(
    (j) => j.status !== "qc_passed" && j.status !== "cancelled",
  );
  if ((jobs ?? []).length === 0 || pending.length > 0) {
    return { error: "検品が終わっていないジョブがあります" };
  }

  const { data, error } = await queryResult(
    db
      .insertInto("shipments")
      .values({
        order_id: v.orderId,
        carrier: v.carrier as ShippingCarrier,
        service_name: v.serviceName ?? null,
        tracking_number: v.trackingNumber,
        box_type: v.boxType ?? null,
        weight_grams: v.weightGrams,
        size_sum_cm: v.sizeSumCm,
        shipping_fee_jpy: v.shippingFeeJpy,
        packer_id: user.id,
      })
      .returning(["id"])
      .execute(),
  );

  if (error) {
    if (error.code === "23505")
      return { error: "この注文はすでに発送登録されています" };
    return { error: `発送登録に失敗しました（${error.message}）` };
  }
  if (!data || data.length === 0) return { error: "発送登録に失敗しました" };

  revalidatePath("/admin/print-queue");
  revalidatePath("/mypage/orders");
  return {
    error: null,
    message: "発送を登録しました。購入者の注文は「発送済み」になります",
  };
}

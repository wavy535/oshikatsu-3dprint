"use server";

import { queryResult } from "@/lib/db/result";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/auth/guards";
import type { OpsActionState } from "./action-state";

// =============================================================================
// フィラメント在庫
//   在庫数は直接書かない。増減は必ず filament_ledger に積み、stock_grams は
//   トリガー（apply_filament_ledger）が更新する。台帳と在庫が食い違わないようにするため。
// =============================================================================

const restockSchema = z.object({
  filamentId: idSchema,
  grams: z.coerce.number().positive("1g以上で入力してください").max(100000),
  reason: z.enum(["restock", "waste", "adjust"]),
});

/** 補充・廃棄・棚卸し調整。廃棄は負の増減として積む。 */
export async function adjustFilamentStockAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = restockSchema.safeParse({
    filamentId: formData.get("filamentId"),
    grams: formData.get("grams"),
    reason: formData.get("reason") ?? "restock",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const { filamentId, grams, reason } = parsed.data;

  const { db, user } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .insertInto("filament_ledger")
      .values({
        filament_id: filamentId,
        delta_grams: reason === "waste" ? -grams : grams,
        reason,
        actor_id: user.id,
      })
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0) {
    return {
      error: `台帳への記録に失敗しました（${error?.message ?? "0件"}）`,
    };
  }

  revalidatePath("/admin/filaments");
  return {
    error: null,
    message:
      reason === "waste"
        ? `${grams}g を廃棄として記録しました`
        : `${grams}g を記録しました`,
  };
}

/** 使う／使わないの切り替え。無効にしても作品の色スロットは残る（restrict）。 */
export async function toggleFilamentActiveAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const filamentId = String(formData.get("filamentId") ?? "");
  const next = formData.get("isActive") === "true";
  if (!filamentId) return { error: "フィラメントが指定されていません" };

  const { db } = await requireAdmin();
  const { data, error } = await queryResult(
    db
      .updateTable("filaments")
      .set({ is_active: next })
      .where("filaments.id", "=", filamentId)
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: "更新できませんでした" };

  revalidatePath("/admin/filaments");
  return { error: null };
}

const newFilamentSchema = z.object({
  material: z.enum(["PLA", "PETG", "ABS", "TPU"]),
  colorName: z.string().min(1, "色の名前を入れてください").max(30),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "色コードは #RRGGBB で入力してください"),
  pricePerGram: z.coerce.number().min(0).max(999),
  stockGrams: z.coerce.number().int().min(0).max(100000),
});

/** 新しいフィラメントの登録。初期在庫があれば台帳に「補充」として積む。 */
export async function createFilamentAction(
  _prev: OpsActionState,
  formData: FormData,
): Promise<OpsActionState> {
  const parsed = newFilamentSchema.safeParse({
    material: formData.get("material"),
    colorName: String(formData.get("colorName") ?? "").trim(),
    colorHex: String(formData.get("colorHex") ?? "").trim(),
    pricePerGram: formData.get("pricePerGram") || 3.5,
    stockGrams: formData.get("stockGrams") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const v = parsed.data;

  const { db, user } = await requireAdmin();
  const { error } = await queryResult(
    db.transaction().execute(async (tx) => {
      const filament = await tx
        .insertInto("filaments")
        .values({
          material: v.material,
          color_name: v.colorName,
          color_hex: v.colorHex.toUpperCase(),
          price_per_gram: v.pricePerGram,
          stock_grams: 0,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      if (v.stockGrams > 0) {
        await tx
          .insertInto("filament_ledger")
          .values({
            filament_id: filament.id,
            delta_grams: v.stockGrams,
            reason: "restock",
            actor_id: user.id,
          })
          .execute();
      }
    }),
  );
  if (error)
    return {
      error:
        error.code === "23505"
          ? "同じ素材・色のフィラメントがすでにあります"
          : `登録に失敗しました（${error.message}）`,
    };

  revalidatePath("/admin/filaments");
  return {
    error: null,
    message: `${v.material}・${v.colorName} を登録しました`,
  };
}

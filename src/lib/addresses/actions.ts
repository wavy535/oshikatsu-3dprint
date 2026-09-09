"use server";
import { queryResult } from "@/lib/db/result";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOptionalUser } from "@/lib/auth/guards";

export type AddressActionState = { error: string | null; ok?: boolean };

const addressSchema = z.object({
  id: z.uuid().optional(),
  recipientName: z.string().min(1, "お名前を入力してください").max(60),
  postalCode: z
    .string()
    .regex(/^\d{7}$/, "郵便番号は数字7桁で入力してください"),
  prefecture: z.string().min(1, "都道府県を入力してください").max(10),
  city: z.string().min(1, "市区町村を入力してください").max(60),
  addressLine: z.string().min(1, "番地・建物名を入力してください").max(120),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "電話番号は数字10〜11桁で入力してください"),
  isDefault: z.boolean(),
});

export async function saveAddressAction(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const parsed = addressSchema.safeParse({
    id: formData.get("id") || undefined,
    recipientName: formData.get("recipientName"),
    postalCode: String(formData.get("postalCode") ?? "").replace(/-/g, ""),
    prefecture: formData.get("prefecture"),
    city: formData.get("city"),
    addressLine: formData.get("addressLine"),
    phone: String(formData.get("phone") ?? "").replace(/-/g, ""),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  const values = {
    recipient_name: parsed.data.recipientName,
    postal_code: parsed.data.postalCode,
    prefecture: parsed.data.prefecture,
    city: parsed.data.city,
    address_line: parsed.data.addressLine,
    phone: parsed.data.phone,
    is_default: parsed.data.isDefault,
  };

  // 既定は1件だけ。先に全部落としてから立てる
  if (values.is_default) {
    await queryResult(
      db
        .updateTable("addresses")
        .set({ is_default: false })
        .where("addresses.user_id", "=", user.id)
        .execute(),
    );
  }

  const { data, error } = parsed.data.id
    ? await queryResult(
        db
          .updateTable("addresses")
          .set(values)
          .where("addresses.id", "=", parsed.data.id)
          .where("addresses.user_id", "=", user.id)
          .returning(["id"])
          .execute(),
      )
    : await queryResult(
        db
          .insertInto("addresses")
          .values({ ...values, user_id: user.id })
          .returning(["id"])
          .execute(),
      );

  if (error || !data || data.length === 0)
    return { error: "保存できませんでした" };

  revalidatePath("/mypage/addresses");
  return { error: null, ok: true };
}

export async function deleteAddressAction(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  const { data, error } = await queryResult(
    db
      .deleteFrom("addresses")
      .where("addresses.id", "=", id)
      .where("addresses.user_id", "=", user.id)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "削除できませんでした" };
  revalidatePath("/mypage/addresses");
  return { error: null, ok: true };
}

export async function setDefaultAddressAction(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "対象が特定できません" };

  const { db, user } = await getOptionalUser();
  if (!user) return { error: "ログインが必要です" };

  await queryResult(
    db
      .updateTable("addresses")
      .set({ is_default: false })
      .where("addresses.user_id", "=", user.id)
      .execute(),
  );
  const { data, error } = await queryResult(
    db
      .updateTable("addresses")
      .set({ is_default: true })
      .where("addresses.id", "=", id)
      .where("addresses.user_id", "=", user.id)
      .returning(["id"])
      .execute(),
  );

  if (error || !data || data.length === 0)
    return { error: "変更できませんでした" };
  revalidatePath("/mypage/addresses");
  return { error: null, ok: true };
}

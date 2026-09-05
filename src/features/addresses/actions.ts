"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/action-result";
import { upsertAddressSchema, type UpsertAddressInput } from "./schema";

export async function upsertAddress(
  input: UpsertAddressInput
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();

  const parsed = upsertAddressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力エラー", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const v = parsed.data;

  const row = {
    user_id: user.id,
    recipient_name: v.recipientName,
    postal_code: v.postalCode,
    prefecture: v.prefecture,
    city: v.city,
    address_line1: v.addressLine1,
    address_line2: v.addressLine2 || null,
    phone: v.phone,
  };

  const query = v.id
    ? supabase
        .from("shipping_addresses")
        .update(row)
        .eq("id", v.id)
        .eq("user_id", user.id)
        .select("id")
        .single()
    : supabase.from("shipping_addresses").insert(row).select("id").single();

  const { data, error } = await query;
  if (error || !data) {
    return { ok: false, error: "配送先の保存に失敗しました" };
  }

  revalidatePath("/mypage/addresses");
  return { ok: true, data: { id: data.id } };
}

export async function deleteAddress(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("shipping_addresses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: "削除に失敗しました" };
  }

  revalidatePath("/mypage/addresses");
  return { ok: true, data: undefined };
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  // 部分ユニークインデックス（1ユーザー1既定配送先）に抵触しないよう、
  // 先に全解除してから対象のみ設定する（DESIGN.md §4.4.1）。
  const { error: unsetError } = await supabase
    .from("shipping_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);
  if (unsetError) {
    return { ok: false, error: "既定配送先の更新に失敗しました" };
  }

  const { error: setError } = await supabase
    .from("shipping_addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (setError) {
    return { ok: false, error: "既定配送先の更新に失敗しました" };
  }

  revalidatePath("/mypage/addresses");
  return { ok: true, data: undefined };
}

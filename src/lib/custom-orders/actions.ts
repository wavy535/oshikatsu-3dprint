"use server";
import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
import { sql } from "kysely";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { idSchema } from "@/lib/validation";

import { requireCreator, requireUser } from "@/lib/auth/guards";
import type { QuoteSpecRow } from "@/lib/custom-orders/labels";

export type CustomOrderActionState = { error: string | null; message?: string };

const OK: CustomOrderActionState = { error: null };

// -----------------------------------------------------------------------------
// 買う人
// -----------------------------------------------------------------------------
const requestSchema = z.object({
  creatorId: idSchema,
  workId: idSchema.optional(),
  message: z
    .string()
    .trim()
    .min(20, "ご相談内容は20文字以上でお書きください")
    .max(2000),
  nuiSize: z.string().max(20).optional(),
  budget: z.string().max(30).optional(),
  deadline: z.string().max(60).optional(),
});

/**
 * 相談を送る。相談は custom_order_requests に残し、同じ内容をメッセージとしても送る
 * （プロトタイプ「相談内容はメッセージとしてクリエイターに送信されます」。通知はメッセージ側のトリガーが出す）。
 */
export async function createCustomRequestAction(
  _prev: CustomOrderActionState,
  formData: FormData,
): Promise<CustomOrderActionState> {
  const parsed = requestSchema.safeParse({
    creatorId: formData.get("creatorId"),
    workId: String(formData.get("workId") ?? "") || undefined,
    message: formData.get("message"),
    nuiSize: String(formData.get("nuiSize") ?? "") || undefined,
    budget: String(formData.get("budget") ?? "") || undefined,
    deadline: String(formData.get("deadline") ?? "") || undefined,
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  const v = parsed.data;

  const { db, user } = await requireUser("/mypage/custom-orders/new");
  if (v.creatorId === user.id) return { error: "自分に相談は送れません" };

  const lines = [v.message];
  const meta = [
    v.nuiSize ? `ご希望の対応ぬいサイズ：${v.nuiSize}` : null,
    v.budget ? `ご予算目安：${v.budget}` : null,
    v.deadline ? `納期のご希望：${v.deadline}` : null,
  ].filter((t): t is string => !!t);
  if (meta.length) lines.push("", ...meta);
  const body = lines.join("\n");

  const { data: req, error } = await queryResult(
    db
      .insertInto("custom_order_requests")
      .values({
        requester_id: user.id,
        creator_id: v.creatorId,
        reference_work_id: v.workId ?? null,
        message: body,
      })
      .returning(["id"])
      .executeTakeFirst(),
  );
  if (error || !req)
    return { error: `相談を送れませんでした（${error?.message ?? "0件"}）` };

  await queryResult(
    db
      .insertInto("messages")
      .values({
        sender_id: user.id,
        recipient_id: v.creatorId,
        body: `【オーダーメイド相談】\n${body}`,
      })
      .returning(["id"])
      .execute(),
  );

  revalidatePath("/mypage/custom-orders");
  redirect(`/mypage/custom-orders/${req.id}`);
}

/** 見積りを承認する。DB 側が専用サイズを作ってカートに入れるので、そのままカートへ送る。 */
export async function acceptQuoteAction(
  _prev: CustomOrderActionState,
  formData: FormData,
): Promise<CustomOrderActionState> {
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "見積りが指定されていません" };

  const { db } = await requireUser("/mypage/custom-orders");
  const { error } = await call(db, "accept_custom_quote", {
    p_quote_id: quoteId,
  });
  if (error) return { error: error.message };

  revalidatePath("/mypage/custom-orders");
  revalidatePath("/cart");
  redirect("/cart");
}

export async function declineQuoteAction(
  _prev: CustomOrderActionState,
  formData: FormData,
): Promise<CustomOrderActionState> {
  const quoteId = String(formData.get("quoteId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!quoteId) return { error: "見積りが指定されていません" };

  const { db } = await requireUser("/mypage/custom-orders");
  const { data, error } = await call(db, "decline_custom_quote", {
    p_quote_id: quoteId,
  });
  if (error) return { error: error.message };
  if (!data) return { error: "この見積りは辞退できません" };

  revalidatePath(`/mypage/custom-orders/${requestId}`);
  return { ...OK, message: "見積りを辞退しました。クリエイターに通知されます" };
}

// -----------------------------------------------------------------------------
// クリエイター
// -----------------------------------------------------------------------------
const quoteSchema = z.object({
  requestId: idSchema,
  priceJpy: z.coerce
    .number()
    .int()
    .min(100, "作品代金は100円以上で入力してください")
    .max(500000),
  grams: z.coerce
    .number()
    .min(1, "推定フィラメントを入力してください")
    .max(20000),
  hours: z.coerce.number().min(0.1, "推定造形時間を入力してください").max(999),
  parts: z.coerce.number().int().min(1).max(200),
  leadDays: z.coerce.number().int().min(1).max(90),
  note: z.string().trim().max(1000).optional(),
  baseWorkId: idSchema.optional(),
});

/**
 * 見積りを提示する。印刷代行費は料金表の式（calc_print_fee）で DB に計算させ、
 * 送料は料金表の値を写す。status は最初から sent（下書き段階は作らない）。
 */
export async function createQuoteAction(
  _prev: CustomOrderActionState,
  formData: FormData,
): Promise<CustomOrderActionState> {
  const parsed = quoteSchema.safeParse({
    requestId: formData.get("requestId"),
    priceJpy: formData.get("priceJpy"),
    grams: formData.get("grams"),
    hours: formData.get("hours"),
    parts: formData.get("parts") || 1,
    leadDays: formData.get("leadDays") || 10,
    note: String(formData.get("note") ?? "") || undefined,
    baseWorkId: String(formData.get("baseWorkId") ?? "") || undefined,
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  const v = parsed.data;

  // 仕様の行（項目 / 確定内容 / 相談時のご希望）。空行は捨てる
  const spec: QuoteSpecRow[] = [];
  for (let i = 0; i < 6; i++) {
    const item = String(formData.get(`spec_item_${i}`) ?? "").trim();
    const decided = String(formData.get(`spec_decided_${i}`) ?? "").trim();
    const requested = String(formData.get(`spec_requested_${i}`) ?? "").trim();
    if (item && decided)
      spec.push({ item, decided, ...(requested ? { requested } : {}) });
  }

  const { db, user } = await requireCreator();

  const { data: req } = await queryResult(
    db
      .selectFrom("custom_order_requests")
      .select([
        "custom_order_requests.id",
        "custom_order_requests.requester_id",
        "custom_order_requests.status",
      ])
      .where("custom_order_requests.id", "=", v.requestId)
      .where("custom_order_requests.creator_id", "=", user.id)
      .executeTakeFirst(),
  );
  if (!req) return { error: "相談が見つかりません" };
  if (req.status === "accepted")
    return { error: "すでに承認された見積りがあります" };

  const [{ data: printFee, error: feeError }, { data: rule }] =
    await Promise.all([
      call(db, "calc_print_fee", {
        grams: v.grams,
        hours: v.hours,
        parts: v.parts,
      }),
      queryResult(
        db
          .selectFrom("print_pricing_rules")
          .select(["print_pricing_rules.shipping_fee_jpy"])
          .where("print_pricing_rules.is_active", "=", true)
          .executeTakeFirst(),
      ),
    ]);
  if (feeError || printFee === null)
    return { error: "印刷代行費を計算できませんでした" };

  const { data, error } = await queryResult(
    db
      .insertInto("custom_order_quotes")
      .values({
        request_id: v.requestId,
        creator_id: user.id,
        buyer_id: req.requester_id,
        base_work_id: v.baseWorkId ?? null,
        status: "sent",
        spec: spec as unknown as never,
        est_filament_grams: v.grams,
        est_print_hours: v.hours,
        part_count: v.parts,
        price_jpy: v.priceJpy,
        print_fee_jpy: printFee,
        shipping_fee_jpy: rule?.shipping_fee_jpy ?? 0,
        lead_time_days: v.leadDays,
        note: v.note ?? null,
      })
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: `見積りを出せませんでした（${error?.message ?? "0件"}）` };

  await queryResult(
    db
      .updateTable("custom_order_requests")
      .set({ status: "responded" })
      .where("custom_order_requests.id", "=", v.requestId)
      .returning(["id"])
      .execute(),
  );

  revalidatePath(`/studio/custom-orders/${v.requestId}`);
  revalidatePath("/studio/custom-orders");
  return { ...OK, message: "見積りを提示しました。購入者に通知されます" };
}

/** 相談をお断りする。 */
export async function declineRequestAction(
  _prev: CustomOrderActionState,
  formData: FormData,
): Promise<CustomOrderActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "相談が指定されていません" };

  const { db, user } = await requireCreator();
  const { data, error } = await queryResult(
    db
      .updateTable("custom_order_requests")
      .set({ status: "declined" })
      .where("custom_order_requests.id", "=", requestId)
      .where("custom_order_requests.creator_id", "=", user.id)
      .where(
        sql<boolean>`${sql.ref("custom_order_requests.status")} = any(${["pending", "responded"]})`,
      )
      .returning(["id"])
      .execute(),
  );
  if (error || !data || data.length === 0)
    return { error: "更新できませんでした" };

  revalidatePath(`/studio/custom-orders/${requestId}`);
  revalidatePath("/studio/custom-orders");
  return {
    ...OK,
    message: "お断りしました。購入者にはメッセージで一言添えてあげてください",
  };
}

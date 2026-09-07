/** オーダーメイド相談の表示ラベル。クライアントからも読むので server-only にしない。 */
import type { CustomRequestStatus, QuoteStatus } from "@/types/db";

export const REQUEST_STATUS_LABEL: Record<CustomRequestStatus, string> = {
  pending: "回答待ち",
  responded: "見積り提示中",
  accepted: "承認済み",
  declined: "お断り",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "下書き",
  sent: "見積り提示中",
  accepted: "承認済み",
  ordered: "注文済み",
  revision: "修正中",
  declined: "辞退",
  expired: "期限切れ",
};

export const NUI_SIZE_OPTIONS = ["10cm", "15cm", "20cm", "その他"] as const;
export const BUDGET_OPTIONS = ["〜¥3,000", "¥3,000〜¥5,000", "¥5,000〜¥10,000", "¥10,000〜", "相談したい"] as const;
export const DEADLINE_OPTIONS = ["特になし", "2週間以内", "1か月以内", "イベントに合わせたい（本文に記載）"] as const;

/** 見積りの「確定した仕様」の1行。spec（jsonb）の中身。 */
export type QuoteSpecRow = { item: string; decided: string; requested?: string };

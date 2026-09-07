/**
 * 運営コンソールの表示ラベル。
 *
 * クライアントコンポーネント（検品フォームなど）からも読むので、
 * `server-only` な queries.ts ではなくここに置く。
 */
import type {
  PrintJobStatus,
  PrintOrientation,
  ReprintCause,
  ShippingCarrier,
  SupportMode,
} from "@/types/db";

/** バッジの色味。プロトタイプの badge n / b / y / g / r に対応する。 */
export type Tone = "neutral" | "info" | "warn" | "ok" | "danger";

export const JOB_STATUS_LABEL: Record<PrintJobStatus, string> = {
  queued: "未着手",
  printing: "印刷中",
  printed: "検品待ち",
  qc_passed: "検品OK",
  qc_failed: "検品NG",
  reprinting: "再印刷中",
  cancelled: "中止",
};

export const JOB_STATUS_TONE: Record<PrintJobStatus, Tone> = {
  queued: "neutral",
  printing: "info",
  printed: "warn",
  qc_passed: "ok",
  qc_failed: "danger",
  reprinting: "info",
  cancelled: "neutral",
};

/** 印刷キューの絞り込み。「作業中」はまとめて追いたいことが多いので束ねてある。 */
export const QUEUE_STATUS_FILTERS = [
  { value: "open", label: "作業中のみ", statuses: ["queued", "printing", "reprinting", "printed", "qc_failed"] },
  { value: "queued", label: "未着手", statuses: ["queued"] },
  { value: "printing", label: "印刷中", statuses: ["printing", "reprinting"] },
  { value: "printed", label: "検品待ち", statuses: ["printed"] },
  { value: "qc_failed", label: "検品NG", statuses: ["qc_failed"] },
  { value: "qc_passed", label: "検品OK", statuses: ["qc_passed"] },
  { value: "all", label: "すべて", statuses: [] },
] as const;

export type QueueStatusFilter = (typeof QUEUE_STATUS_FILTERS)[number]["value"];

export const REPRINT_CAUSE_LABEL: Record<ReprintCause, string> = {
  model: "モデル側（データの問題）",
  print: "印刷側（造形の失敗）",
  material: "材料側（フィラメント不良）",
  handling: "取り扱い（検品・梱包時の破損）",
};

/** 「誰の負担になるか」は原因から自動で決まる（設計判断7）。画面にも書いておく。 */
export const REPRINT_CAUSE_NOTE: Record<ReprintCause, string> = {
  model: "クリエイターに修正依頼が飛び、再印刷分の代行費は運営負担になりません。",
  print: "運営負担で刷り直します。クリエイターへの通知はありません。",
  material: "運営負担で刷り直します。クリエイターへの通知はありません。",
  handling: "運営負担で刷り直します。クリエイターへの通知はありません。",
};

export const CARRIER_LABEL: Record<ShippingCarrier, string> = {
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
  japanpost: "日本郵便",
  other: "その他",
};

export const ORIENTATION_LABEL: Record<PrintOrientation, string> = {
  flat: "XY 平置き",
  upright: "Z 立て",
  tilted: "傾け置き",
  as_is: "データのまま",
};

export const SUPPORT_LABEL: Record<SupportMode, string> = {
  none: "不要",
  auto: "要・自動",
  custom: "要・指定あり",
};

export function yen(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `¥${n.toLocaleString("ja-JP")}`;
}

/** 一覧・詳細で使う短い日時（例: 09/06 18:00）。 */
export function shortDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 「残りわずか」の目安。運用で変えたくなったらここだけ直す。 */
export const LOW_STOCK_GRAMS = 500;

export const LEDGER_REASON_LABEL: Record<string, string> = {
  print: "印刷で消費",
  restock: "補充",
  waste: "廃棄",
  adjust: "棚卸し調整",
};

/** 注文一覧の絞り込み。運営が追いたい単位で束ねてある。 */
export const ORDER_STATUS_FILTERS = [
  { value: "open", label: "進行中", statuses: ["paid", "printing_queued", "printing", "packaging"] },
  { value: "packaging", label: "発送待ち", statuses: ["packaging"] },
  { value: "shipped", label: "発送済み", statuses: ["shipped"] },
  { value: "completed", label: "取引完了", statuses: ["completed"] },
  { value: "cancelled", label: "キャンセル・返金", statuses: ["cancelled", "refunded"] },
  { value: "payment_pending", label: "支払い待ち", statuses: ["payment_pending"] },
  { value: "all", label: "すべて", statuses: [] },
] as const;

/** 売上として数える注文のステータス（支払い前・キャンセル・返金は含めない）。 */
export const SALES_ORDER_STATUSES = [
  "paid",
  "printing_queued",
  "printing",
  "packaging",
  "shipped",
  "completed",
] as const;

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  requested: "申請中",
  processing: "処理中",
  paid: "振込済み",
  rejected: "却下",
};

/** 「2026-09」形式の月キー。売上画面の期間指定に使う。 */
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

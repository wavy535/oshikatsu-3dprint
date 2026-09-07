/** 修正依頼の表示ラベル。クライアントからも読むので server-only にしない。 */
import type { RevisionResolution, RevisionStatus } from "@/types/db";

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "対応済み",
  disputed: "運営に相談中",
  cancelled: "取り消し",
};

export const RESOLUTION_LABEL: Record<RevisionResolution, string> = {
  reupload: "データを修正して差し替える",
  instruction: "印刷指示だけ変更する",
  unlist: "このサイズを出品停止にする",
  no_action: "対応不要（運営と合意）",
};

export const RESOLUTION_NOTE: Record<RevisionResolution, string> = {
  reupload: "STEP1 に戻って再検証。価格・在庫・レビューは引き継がれます",
  instruction: "データはそのまま。運営向けの向き・サポート・組み立ての指示を直します",
  unlist: "修正できるまで新規注文を止めます（既存の注文は運営が連絡します）",
  no_action: "運営との相談で「データの問題ではない」と決まったときに使います",
};

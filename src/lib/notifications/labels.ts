import type { NotificationKind } from "@/types/db";

export const KIND_LABEL: Record<NotificationKind, string> = {
  order_shipping: "注文・発送",
  favorite_price: "お気に入りの値下げ",
  message: "メッセージ",
  review: "レビュー",
  creator: "クリエイター",
  announcement: "お知らせ",
};

/** アプリ内で必ず受け取る種類（DBの check 制約と揃えている） */
export const MANDATORY_KINDS: NotificationKind[] = [
  "order_shipping",
  "creator",
];

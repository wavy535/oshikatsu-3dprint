import "server-only";
import { requireUser } from "@/lib/auth/guards";
import type { OrderStatus } from "@/types/db";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  payment_pending: "支払い待ち",
  paid: "決済完了",
  printing_queued: "印刷待ち",
  printing: "印刷中",
  packaging: "梱包中",
  shipped: "発送済み",
  completed: "取引完了",
  cancelled: "キャンセル",
  refunded: "返金済み",
};

const ITEM_SELECT = `id, quantity, unit_price, size_label_snapshot, work_id, creator_id,
  works(title, work_images(storage_path, sort_order)),
  profiles!order_items_creator_id_fkey(display_name),
  reviews(id, rating)`;

export async function listMyOrders() {
  const { supabase, user } = await requireUser("/mypage/orders");
  const { data } = await supabase
    .from("orders")
    .select(
      `id, status, total_amount, created_at, shipped_at, tracking_number,
       order_items(${ITEM_SELECT})`
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getMyOrder(id: string) {
  const { supabase, user } = await requireUser(`/mypage/orders/${id}`);
  const { data } = await supabase
    .from("orders")
    .select(
      `id, status, subtotal_amount, platform_fee_amount, print_cost_amount, total_amount,
       created_at, shipped_at, tracking_number, ship_due_at,
       addresses(recipient_name, postal_code, prefecture, city, address_line, phone),
       order_items(${ITEM_SELECT})`
    )
    .eq("id", id)
    .eq("buyer_id", user.id)
    .maybeSingle();
  return data;
}

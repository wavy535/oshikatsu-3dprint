import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listMyBuyerThreads(buyerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      `id, kind, subject, last_message_at, buyer_unread_count, is_closed,
       profiles!message_threads_creator_id_fkey(display_name, handle),
       products(title, slug),
       orders(order_number)`
    )
    .eq("buyer_id", buyerId)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMyCreatorThreads(creatorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      `id, kind, subject, last_message_at, creator_unread_count, is_closed,
       profiles!message_threads_buyer_id_fkey(display_name, handle),
       products(title, slug),
       orders(order_number)`
    )
    .eq("creator_id", creatorId)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getThread(threadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      `*,
       buyer:profiles!message_threads_buyer_id_fkey(id, display_name, handle),
       creator:profiles!message_threads_creator_id_fkey(id, display_name, handle),
       products(title, slug),
       orders(order_number),
       messages(id, sender_id, body, is_admin_note, created_at, deleted_at)`
    )
    .eq("id", threadId)
    .single();
  if (error) return null;
  return data;
}

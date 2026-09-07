import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ShellContext = {
  user: { id: string } | null;
  profile: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    role: string;
  } | null;
  isCreator: boolean;
  cartCount: number;
  unreadCount: number;
  primaryNuiLabel: string | null;
};

const GUEST: ShellContext = {
  user: null,
  profile: null,
  isCreator: false,
  cartCount: 0,
  unreadCount: 0,
  primaryNuiLabel: null,
};

/**
 * ヘッダーの会員メニュー（Figma ⓪ 共通「ログイン後 Top Page」46:362）に必要な情報を
 * 1回で集める。未ログインならクエリを投げずにゲスト既定値を返す。
 */
export async function getShellContext(): Promise<ShellContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return GUEST;

  const [profileRes, creatorRes, cartRes, buyerThreadsRes, creatorThreadsRes, nuiRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("handle, display_name, avatar_url, role")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("creator_profiles")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("cart_items")
        .select("quantity")
        .eq("user_id", user.id),
      supabase
        .from("message_threads")
        .select("buyer_unread_count")
        .eq("buyer_id", user.id),
      supabase
        .from("message_threads")
        .select("creator_unread_count")
        .eq("creator_id", user.id),
      supabase
        .from("user_nuis")
        .select("nui_sizes(label)")
        .eq("user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

  const unreadCount =
    (buyerThreadsRes.data ?? []).reduce((n, t) => n + (t.buyer_unread_count ?? 0), 0) +
    (creatorThreadsRes.data ?? []).reduce((n, t) => n + (t.creator_unread_count ?? 0), 0);

  return {
    user: { id: user.id },
    profile: profileRes.data ?? null,
    isCreator: creatorRes.data?.status === "approved",
    cartCount: (cartRes.data ?? []).reduce((n, i) => n + (i.quantity ?? 0), 0),
    unreadCount,
    primaryNuiLabel: nuiRes.data?.nui_sizes?.label ?? null,
  };
}

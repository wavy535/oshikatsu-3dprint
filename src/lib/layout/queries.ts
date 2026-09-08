import "server-only";
import { getUserProfile } from "@/lib/auth/guards";
import type { UserRole } from "@/types/db";

export type ShellContext = {
  user: { id: string } | null;
  profile: {
    display_name: string;
    avatar_url: string | null;
    role: UserRole;
  } | null;
  isCreator: boolean;
  isAdmin: boolean;
  cartCount: number;
  unreadCount: number;
  /** メインのマイぬい。ヘッダーとサイズ絞り込みの既定に使う */
  mainNui: { id: string; name: string; nui_size_cm: number | null } | null;
};

const GUEST: ShellContext = {
  user: null,
  profile: null,
  isCreator: false,
  isAdmin: false,
  cartCount: 0,
  unreadCount: 0,
  mainNui: null,
};

/**
 * ヘッダーとサイドナビが必要とする情報を1回で集める。
 * 未ログインならクエリを投げずにゲスト既定値を返す。
 *
 * 未読数は notifications を数えず `unread_notification_count()` を呼ぶ。
 * 通知は DB トリガーだけが作る設計なので、数えるのも DB 側に寄せておく。
 */
export async function getShellContext(): Promise<ShellContext> {
  const { supabase, user, profile } = await getUserProfile();
  if (!user) return GUEST;

  const [cartRes, unreadRes, nuiRes] = await Promise.all([
    supabase
      .from("cart_items")
      .select("quantity, carts!inner(user_id)")
      .eq("carts.user_id", user.id),
    supabase.rpc("unread_notification_count"),
    supabase
      .from("nui_profiles")
      .select("id, name, nui_size_cm")
      .eq("user_id", user.id)
      .eq("is_main", true)
      .maybeSingle(),
  ]);

  const role = profile?.role ?? "buyer";

  return {
    user: { id: user.id },
    profile,
    isCreator: role === "creator" || role === "admin",
    isAdmin: role === "admin",
    cartCount: (cartRes.data ?? []).reduce((n, i) => n + (i.quantity ?? 0), 0),
    unreadCount: unreadRes.data ?? 0,
    mainNui: nuiRes.data ?? null,
  };
}

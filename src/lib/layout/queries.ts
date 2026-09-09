import { cache } from "react";
import { sql } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";
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

/** Header and sidebar share this result within one render, never across users. */
export const getShellContext = cache(async (): Promise<ShellContext> => {
  const { db, user, profile } = await getUserProfile();
  if (!user) return GUEST;
  const counts = await db
    .selectNoFrom((eb) => [
      eb
        .selectFrom("cart_items")
        .innerJoin("carts", "carts.id", "cart_items.cart_id")
        .select(
          sql<number>`coalesce(sum(cart_items.quantity), 0)::integer`.as(
            "count",
          ),
        )
        .where("carts.user_id", "=", user.id)
        .as("cartCount"),
      sql<number>`public.unread_notification_count()`.as("unreadCount"),
      jsonObjectFrom(
        eb
          .selectFrom("nui_profiles")
          .select(["id", "name", "nui_size_cm"])
          .where("user_id", "=", user.id)
          .where("is_main", "=", true),
      ).as("mainNui"),
    ])
    .executeTakeFirstOrThrow();

  const role = profile?.role ?? "buyer";

  return {
    user: { id: user.id },
    profile,
    isCreator: role === "creator" || role === "admin",
    isAdmin: role === "admin",
    cartCount: counts.cartCount ?? 0,
    unreadCount: counts.unreadCount,
    mainNui: counts.mainNui,
  };
});

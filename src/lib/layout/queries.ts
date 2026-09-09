import { jsonObjectFrom } from "kysely/helpers/postgres";
import { queryResult } from "@/lib/db/result";
import { call } from "@/lib/db/functions";
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
  const { db, user, profile } = await getUserProfile();
  if (!user) return GUEST;

  const [cartRes, unreadRes, nuiRes] = await Promise.all([
    queryResult(
      db
        .selectFrom("cart_items")
        .select((eb) => [
          "cart_items.quantity",
          jsonObjectFrom(
            eb
              .selectFrom("carts as r0")
              .select(["r0.user_id"])
              .where("r0.user_id", "=", user.id)
              .whereRef("r0.id", "=", "cart_items.cart_id"),
          )
            .$notNull()
            .as("carts"),
        ])
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("carts as r0")
              .select(["r0.user_id"])
              .where("r0.user_id", "=", user.id)
              .whereRef("r0.id", "=", "cart_items.cart_id")
              .clearSelect()
              .select("r0.id"),
          ),
        )
        .execute(),
    ),
    call(db, "unread_notification_count", {}),
    queryResult(
      db
        .selectFrom("nui_profiles")
        .select([
          "nui_profiles.id",
          "nui_profiles.name",
          "nui_profiles.nui_size_cm",
        ])
        .where("nui_profiles.user_id", "=", user.id)
        .where("nui_profiles.is_main", "=", true)
        .executeTakeFirst(),
    ),
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

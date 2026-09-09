import { call } from "@/lib/db/functions";
import "server-only";
import { requireAdmin } from "@/lib/auth/guards";

// =============================================================================
// 運営メンバー
// =============================================================================

/** 運営メンバーの一覧。メールは app_users 側なので管理者用DB関数経由で引く。 */
export async function listAdminMembers() {
  const { db } = await requireAdmin();
  const { data } = await call(db, "list_admin_members", {});
  return data ?? [];
}

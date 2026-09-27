import "server-only";
import { cacheForRequest } from "vinext/cache";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { getAuth } from "./config";
import { database } from "@/lib/db/client";

/** Guards verify the session in D1. Database authorization uses the verified identity. */
export async function requireUser(redirectTo?: string) {
  const { db, user } = await getOptionalUser();
  if (!user) {
    redirect(
      redirectTo
        ? `/login?redirect=${encodeURIComponent(redirectTo)}`
        : "/login",
    );
  }
  return { db, user };
}

/**
 * 公開ページ用。未ログインでもリダイレクトせず null を返す。
 * vinext の HTTP リクエストスコープで検証結果を共有する。
 * React.cache はこのランタイムの非同期 reader 呼び出しをまとめられない。
 */
export const getOptionalUser = cacheForRequest(async () => {
  // Resolve the request before initializing runtime-only secrets/connections.
  // This also makes Next.js defer these readers during a credential-free build.
  const requestHeaders = await headers();
  // No session token means anonymous. Avoid initializing Better Auth and its
  // database schema check for public visitors. Cookie presence is NEVER proof
  // of authentication: all supplied tokens still go through getSession below.
  // Keep these default cookie names aligned with config.ts (including __Secure-).
  if (!getSessionCookie(requestHeaders)) {
    return { db: database(), user: null };
  }
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const user = session?.user ?? null;
  return { db: database(user?.id), user };
});

/** Public readers still carry the signed-in user's RLS context when available. */
export async function getDatabase() {
  return (await getOptionalUser()).db;
}

/** vinext のリクエスト内で共有。別リクエスト・別ユーザーとは共有しない。 */
export const getUserProfile = cacheForRequest(async () => {
  const { db, user } = await getOptionalUser();
  if (!user) return { db, user, profile: null };
  const profile =
    (await db
      .selectFrom("profiles")
      .select(["role", "display_name", "avatar_url"])
      .where("id", "=", user.id)
      .executeTakeFirst()) ?? null;
  return { db, user, profile };
});

/**
 * クリエイター向け画面。
 * profiles.role は承認トリガーだけが creator へ上げるので、ここはそれを見る。
 */
export async function requireCreator() {
  const { db, user } = await requireUser("/studio");
  const { profile } = await getUserProfile();
  if (profile?.role !== "creator" && profile?.role !== "admin")
    redirect("/creator/apply");
  return { db, user, profile };
}

export async function requireAdmin() {
  const { db, user } = await requireUser("/admin");
  const { profile } = await getUserProfile();
  // 403 ではなく 404 を返す（管理画面の存在を隠す）
  if (profile?.role !== "admin") notFound();
  return { db, user, profile };
}

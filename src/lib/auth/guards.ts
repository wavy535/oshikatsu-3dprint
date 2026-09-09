import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "./config";
import { database } from "@/lib/db/client";

/** Guards verify the session in PostgreSQL. RLS enforces the same user identity. */
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

/** 公開ページ用。未ログインでもリダイレクトせず null を返す。 */
export const getOptionalUser = cache(async () => {
  // Resolve the request before initializing runtime-only secrets/connections.
  // This also makes Next.js defer these readers during a credential-free build.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const user = session?.user ?? null;
  return { db: database(user?.id), user };
});

/** Public readers still carry the signed-in user's RLS context when available. */
export async function getDatabase() {
  return (await getOptionalUser()).db;
}

/** Reactのリクエスト内キャッシュ。別リクエスト・別ユーザーとは共有しない。 */
export const getUserProfile = cache(async () => {
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

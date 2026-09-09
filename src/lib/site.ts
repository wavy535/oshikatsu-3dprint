import "server-only";

/** メール内リンクの公開URL。サーバーの実行時に設定する。 */
export function siteUrl() {
  const value = process.env.SITE_URL?.trim();
  if (!value && process.env.NODE_ENV === "production") throw new Error("SITE_URL is required");
  return (value || "http://localhost:3000").replace(/\/$/, "");
}

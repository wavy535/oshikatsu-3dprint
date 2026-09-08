/** コンテナの生存確認。DB障害で正常なアプリまで再起動しない。 */
export function GET() {
  return Response.json({ status: "ok" });
}

// 開発中に、スマホなど同じ LAN の端末からログイン・新規登録できるようにするための判定。
// better-auth は SITE_URL の origin と違う相手からのリクエストを "Invalid origin" で断る。
// 開発では QR コードから LAN のアドレス（http://192.168.x.x:3100 など）で開くので、その分だけ許す。

// 私有ネットワークの IPv4（RFC 1918）と、ループバック
const PRIVATE_IPV4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d/;
const LOCAL_HOSTNAMES = ["localhost", "[::1]"];
const HTTP_PROTOCOL = "http:";

/** 同じ LAN の中の http アドレスならその origin、そうでなければ null */
export function privateNetworkOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== HTTP_PROTOCOL) return null;
  const local = LOCAL_HOSTNAMES.includes(url.hostname) || PRIVATE_IPV4.test(url.hostname);
  return local ? url.origin : null;
}

/**
 * 開発中だけ、リクエスト元が同じ LAN なら信頼する（本番では何も足さない）。
 * サーバー側からセッションを読むときなど、リクエストがない呼び出しもある。
 */
export function developmentTrustedOrigins(request?: Request): string[] {
  if (process.env.NODE_ENV === "production") return [];
  const origin = privateNetworkOrigin(request?.headers.get("origin"));
  return origin ? [origin] : [];
}

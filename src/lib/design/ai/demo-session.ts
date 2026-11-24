import "server-only";

export const DEMO_COOKIE = "oshinest-ai-demo";
const LIFETIME = 30 * 86_400_000;

async function signingKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is required");
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(`oshinest:ai-demo:v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

export async function readDemoBrowser(request: Request, now = Date.now()): Promise<string | null> {
  const token = request.headers.get("cookie")?.split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  if (!token || !/^[a-f0-9-]{36}\.\d{13}\.[\w-]{43}$/.test(token)) return null;
  const [id, expires, signature] = token.split(".");
  if (Number(expires) <= now || Number(expires) > now + LIFETIME) return null;
  const valid = await crypto.subtle.verify(
    "HMAC", await signingKey(), Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${id}.${expires}`),
  );
  return valid ? id : null;
}

export async function createDemoBrowser(request: Request, now = Date.now()) {
  const id = crypto.randomUUID();
  const payload = `${id}.${now + LIFETIME}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  const token = `${payload}.${Buffer.from(signature).toString("base64url")}`;
  const cookie = `${DEMO_COOKIE}=${token}; Path=/api/design/demo; HttpOnly; SameSite=Strict; Max-Age=${LIFETIME / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  return { id, cookie };
}

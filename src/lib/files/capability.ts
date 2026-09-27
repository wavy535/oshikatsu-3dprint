import "server-only";
import { z } from "zod";
import { MODEL_LIMITS } from "@/lib/print/limits";

const claimSchema = z.object({
  version: z.literal(1), operation: z.enum(["read", "write"]),
  key: z.string().min(1).max(1024), expires: z.number().int().positive(),
  bytes: z.number().int().positive().max(MODEL_LIMITS.fileBytes).optional(),
  contentType: z.string().max(100).optional(),
}).strict();
export type FileClaim = z.infer<typeof claimSchema>;

async function signingKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`oshinest:file:v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signFileClaim(claim: FileClaim) {
  const payload = Buffer.from(JSON.stringify(claimSchema.parse(claim))).toString("base64url");
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  return `${payload}.${Buffer.from(signature).toString("base64url")}`;
}

export async function verifyFileClaim(token: string | null, operation: FileClaim["operation"]): Promise<FileClaim | null> {
  if (!token || token.length > 2500 || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [payload, signature] = token.split(".");
  try {
    if (!await crypto.subtle.verify("HMAC", await signingKey(), Buffer.from(signature, "base64url"), new TextEncoder().encode(payload))) return null;
    const claim = claimSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (claim.operation !== operation || claim.expires <= Math.floor(Date.now() / 1000)) return null;
    return claim;
  } catch { return null; }
}

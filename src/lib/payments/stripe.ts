import "server-only";
import Stripe from "stripe";

/**
 * Stripe の入口。キーが無ければ null を返し、呼び出し側は「開発用の即時確定」に落ちる。
 *
 * .env.local の STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET を入れると本物の
 * Checkout に切り替わる（コードの変更は要らない）。
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith("sk_test_xxx") || key.trim() === "") return null;
  return new Stripe(key);
}

export const isStripeConfigured = () => getStripe() !== null;

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

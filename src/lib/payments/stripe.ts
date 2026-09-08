import "server-only";
import Stripe from "stripe";

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key && !key.startsWith("sk_test_xxx") ? key : null;
}

export function getStripe(): Stripe | null {
  const key = secretKey();
  return key ? new Stripe(key) : null;
}

export type PaymentMode = "stripe" | "development" | "unavailable";

export function paymentMode(): PaymentMode {
  if (secretKey()) return process.env.STRIPE_WEBHOOK_SECRET?.trim() ? "stripe" : "unavailable";
  return process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_PAYMENTS === "true"
    ? "development"
    : "unavailable";
}

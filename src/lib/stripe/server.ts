import "server-only";
import Stripe from "stripe";

let stripeInstance: Stripe | undefined;

// STRIPE_SECRET_KEY 未設定でもビルド（モジュール評価）自体は落ちないよう、
// 生成を実際に使う瞬間まで遅延させる。
export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return stripeInstance;
}

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type Stripe from "stripe";
import type { Tables } from "@/types/db";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/payments/stripe", () => ({ getStripe: vi.fn(), paymentMode: vi.fn() }));

import { requireUser } from "@/lib/auth/guards";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe, paymentMode } from "@/lib/payments/stripe";
import { startOrderPayment, syncOrderPayment, cancelOrderPayment } from "@/lib/payments/checkout";

const orderId = "13000000-0000-4000-8000-000000000001";
const create = vi.fn();
const retrieve = vi.fn();
const expire = vi.fn();
const apply = vi.fn();
let order: Tables<"orders">;
let visible: boolean;
let saveFails: boolean;

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_test_1", mode: "payment", payment_status: "unpaid", status: "open",
    metadata: { order_id: orderId }, client_reference_id: orderId,
    amount_total: 1620, currency: "jpy", payment_intent: "pi_test_1",
    url: "https://checkout.stripe.com/test", ...overrides,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  visible = true;
  saveFails = false;
  order = {
    id: orderId, buyer_id: "buyer", status: "payment_pending", subtotal_amount: 1000,
    print_cost_amount: 100, shipping_fee_amount: 520, total_amount: 1620,
    checkout_started_at: null, stripe_checkout_session_id: null,
  } as Tables<"orders">;
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: visible ? { ...order } : null, error: null }),
  };
  const client = {
    from: () => query,
    rpc: async () => {
      order.checkout_started_at ??= new Date().toISOString();
      return { data: { ...order }, error: null };
    },
  };
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "buyer" }, supabase: client } as unknown as Awaited<ReturnType<typeof requireUser>>);
  const service = {
    rpc: apply,
    from: () => {
      let update: Partial<Tables<"orders">> | undefined;
      const write = {
        update: (patch: Partial<Tables<"orders">>) => { update = patch; return write; },
        eq: () => write, is: () => write,
        select: async () => {
          if (saveFails) return { data: null, error: { message: "database unavailable" } };
          Object.assign(order, update);
          return { data: [{ id: orderId }], error: null };
        },
      };
      return write;
    },
  };
  vi.mocked(createServiceRoleClient).mockReturnValue(service as unknown as ReturnType<typeof createServiceRoleClient>);
  vi.mocked(paymentMode).mockReturnValue("stripe");
  vi.mocked(getStripe).mockReturnValue({ checkout: { sessions: { create, retrieve, expire } } } as unknown as Stripe);
  create.mockResolvedValue(session());
  retrieve.mockResolvedValue(session());
  expire.mockResolvedValue(session({ status: "expired" }));
  apply.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.restoreAllMocks());

test("他人の注文ではStripeへ接続しない", async () => {
  visible = false;
  await expect(startOrderPayment(orderId)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
  expect(retrieve).not.toHaveBeenCalled();
});
test("別注文のSessionを本人の注文に反映できない", async () => {
  retrieve.mockResolvedValue(session({ metadata: { order_id: "another-order" }, payment_status: "paid" }));
  await expect(syncOrderPayment(orderId, "cs_other")).rejects.toThrow();
  expect(apply).not.toHaveBeenCalled();
});
test("通信失敗後も同じ冪等キーと金額で決済を再作成要求する", async () => {
  create.mockRejectedValueOnce(new Error("network failed"));
  await expect(startOrderPayment(orderId)).rejects.toThrow("network failed");
  await expect(startOrderPayment(orderId)).resolves.toBe("https://checkout.stripe.com/test");
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: `checkout:${orderId}` });
  expect(create.mock.calls[0][0].line_items.map((line: { price_data: { unit_amount: number } }) => line.price_data.unit_amount))
    .toEqual([1000, 100, 520]);
});
test("Sessionの保存失敗後も同じ要求を再試行できる", async () => {
  saveFails = true;
  await expect(startOrderPayment(orderId)).rejects.toThrow("保存できません");
  saveFails = false;
  await startOrderPayment(orderId);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
});
test("既存のSessionは取得して使い、新規作成しない", async () => {
  order.stripe_checkout_session_id = "cs_test_1";
  await startOrderPayment(orderId);
  expect(retrieve).toHaveBeenCalledWith("cs_test_1");
  expect(create).not.toHaveBeenCalled();
});
test("結果不明の古い要求は冪等キーの失効後に再作成しない", async () => {
  order.checkout_started_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await expect(startOrderPayment(orderId)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
test("Stripeで失効できなければ注文を取り消さない", async () => {
  order.checkout_started_at = new Date().toISOString();
  order.stripe_checkout_session_id = "cs_test_1";
  expire.mockRejectedValueOnce(new Error("already completed"));
  await expect(cancelOrderPayment(orderId)).rejects.toThrow();
  expect(apply).not.toHaveBeenCalled();
});
test("Stripeで失効してから注文の取消を反映する", async () => {
  order.checkout_started_at = new Date().toISOString();
  order.stripe_checkout_session_id = "cs_test_1";
  await cancelOrderPayment(orderId);
  expect(expire).toHaveBeenCalledWith("cs_test_1");
  expect(apply).toHaveBeenCalledWith("apply_stripe_checkout", expect.objectContaining({ p_paid: false, p_amount_total: 1620 }));
});
test("開始済みのStripe決済を開発決済へ切り替えない", async () => {
  vi.mocked(paymentMode).mockReturnValue("development");
  order.checkout_started_at = new Date().toISOString();
  await expect(startOrderPayment(orderId)).rejects.toThrow();
  expect(apply).not.toHaveBeenCalled();
});

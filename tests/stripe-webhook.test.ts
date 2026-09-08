import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type Stripe from "stripe";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/payments/checkout", () => ({ applyCheckoutSession: vi.fn() }));

import { getStripe } from "@/lib/payments/stripe";
import { applyCheckoutSession } from "@/lib/payments/checkout";
import { POST } from "@/app/api/stripe/webhook/route";

const constructEvent = vi.fn();
const session = { id: "cs_test", payment_status: "paid" };
beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  constructEvent.mockReturnValue({ id: "evt_test", type: "checkout.session.completed", data: { object: session } });
  vi.mocked(getStripe).mockReturnValue({ webhooks: { constructEvent } } as unknown as Stripe);
  vi.mocked(applyCheckoutSession).mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function request(signature = "signature") {
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "raw body", headers: { "stripe-signature": signature } });
}
test("署名検証の後に支払いを反映する", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(constructEvent).toHaveBeenCalledWith("raw body", "signature", "whsec_test");
  expect(applyCheckoutSession).toHaveBeenCalledWith(session, true);
});
test("署名不正ではDBを操作しない", async () => {
  constructEvent.mockImplementationOnce(() => { throw new Error("bad signature"); });
  expect((await POST(request())).status).toBe(400);
  expect(applyCheckoutSession).not.toHaveBeenCalled();
});
test.each(["checkout.session.completed", "checkout.session.expired"])("%s のDB失敗を500で返して再送可能にする", async (type) => {
  constructEvent.mockReturnValue({ id: "evt_test", type, data: { object: session } });
  vi.mocked(applyCheckoutSession).mockRejectedValueOnce(new Error("database unavailable"));
  expect((await POST(request())).status).toBe(500);
  expect((await POST(request())).status).toBe(200);
});
test("支払い未確定のcompletedイベントは注文を確定しない", async () => {
  constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: { ...session, payment_status: "unpaid" } } });
  expect((await POST(request())).status).toBe(200);
  expect(applyCheckoutSession).not.toHaveBeenCalled();
});
test("設定不足では503を返す", async () => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  expect(applyCheckoutSession).not.toHaveBeenCalled();
});

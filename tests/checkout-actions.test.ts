import { beforeEach, afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/payments/stripe", () => ({ paymentMode: vi.fn() }));
vi.mock("@/lib/payments/checkout", () => ({ PaymentError: class extends Error {}, startOrderPayment: vi.fn(), syncOrderPayment: vi.fn(), cancelOrderPayment: vi.fn() }));

import { requireUser } from "@/lib/auth/guards";
import { paymentMode } from "@/lib/payments/stripe";
import { PaymentError, startOrderPayment } from "@/lib/payments/checkout";
import { placeOrderAction } from "@/lib/checkout/actions";
const orderId = "12000000-0000-4000-8000-000000000001";
const rpc = vi.fn();
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(paymentMode).mockReturnValue("stripe");
  vi.mocked(requireUser).mockResolvedValue({ supabase: { rpc }, user: { id: "buyer" } } as unknown as Awaited<ReturnType<typeof requireUser>>);
  rpc.mockResolvedValue({ data: orderId, error: null });
});
afterEach(() => vi.restoreAllMocks());
function input() {
  const form = new FormData();
  form.set("addressId", "12000000-0000-4000-8000-000000000002");
  return form;
}
test("決済設定がなければ注文を作らない", async () => {
  vi.mocked(paymentMode).mockReturnValue("unavailable");
  expect((await placeOrderAction({ error: null }, input())).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
test("自動再試行できない決済は運営への問い合わせを案内する", async () => {
  vi.mocked(startOrderPayment).mockRejectedValueOnce(new PaymentError("運営へお問い合わせください"));
  expect((await placeOrderAction({ error: null }, input())).error).toBe("運営へお問い合わせください");
});
test("決済接続の失敗後も作成済み注文で再試行し、注文を増やさない", async () => {
  vi.mocked(startOrderPayment).mockRejectedValueOnce(new Error("network failed"));
  const failed = await placeOrderAction({ error: null }, input());
  expect(failed.orderId).toBe(orderId);
  const retry = input();
  retry.set("orderId", failed.orderId!);
  vi.mocked(startOrderPayment).mockResolvedValueOnce("https://checkout.stripe.com/test");
  await expect(placeOrderAction(failed, retry)).rejects.toThrow("redirect:https://checkout.stripe.com/test");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(startOrderPayment).toHaveBeenLastCalledWith(orderId);
});

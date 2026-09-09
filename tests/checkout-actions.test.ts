import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));

vi.mock("@/lib/db/functions", () => ({ call: vi.fn() }));
import { call } from "@/lib/db/functions";
import { requireUser } from "@/lib/auth/guards";
import { placeOrderAction, confirmDemoOrderAction } from "@/lib/checkout/actions";
const orderId = "12000000-0000-4000-8000-000000000001";
const addressId = "12000000-0000-4000-8000-000000000002";
const requestId = "12000000-0000-4000-8000-000000000003";
const rpc = vi.mocked(call);
const db = {} as Awaited<ReturnType<typeof requireUser>>["db"];
beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({ db, user: { id: "buyer" } } as unknown as Awaited<ReturnType<typeof requireUser>>);
  rpc.mockResolvedValue({ data: orderId, error: null });
});
function input() {
  const form = new FormData();
  form.set("addressId", addressId);
  form.set("requestId", requestId);
  return form;
}
test("注文確定にはログインが必要で、認証のリダイレクトを握りつぶさない", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(new Error("redirect:/login"));
  await expect(placeOrderAction({ error: null }, input())).rejects.toThrow("redirect:/login");
  expect(rpc).not.toHaveBeenCalled();
});
test("不正な注文入力をDBに渡さない", async () => {
  const form = input();
  form.set("requestId", "invalid");
  expect((await placeOrderAction({ error: null }, form)).error).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});
test("注文確定が失敗したときは完了画面へ遷移しない", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "在庫が足りません" } });
  expect(await placeOrderAction({ error: null }, input())).toEqual({ error: "在庫が足りません" });
});
test("再送にも同じリクエストIDを渡し、DBで確定した注文へ遷移する", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "通信に失敗しました" } });
  const failed = await placeOrderAction({ error: null }, input());
  await expect(placeOrderAction(failed, input())).rejects.toThrow(`redirect:/checkout/complete?order=${orderId}`);
  expect(rpc).toHaveBeenNthCalledWith(1, db, "place_demo_order", { p_address_id: addressId, p_request_id: requestId, p_note: undefined });
  expect(rpc).toHaveBeenNthCalledWith(2, db, "place_demo_order", { p_address_id: addressId, p_request_id: requestId, p_note: undefined });
});
test("既存注文も利用者権限のDB関数で確認し、拒否をそのまま返す", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "この注文を操作できません" } });
  const form = new FormData();
  form.set("orderId", orderId);
  expect(await confirmDemoOrderAction({ error: null }, form)).toEqual({ error: "この注文を操作できません" });
});

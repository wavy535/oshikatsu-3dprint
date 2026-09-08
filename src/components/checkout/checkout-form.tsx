"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CreditCard, FlaskConical, ImageIcon, MapPin } from "lucide-react";

import { placeOrderAction, type CheckoutActionState } from "@/lib/checkout/actions";
import type { CartLine } from "@/lib/cart/queries";
import type { PaymentMode } from "@/lib/payments/stripe";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";

const initial: CheckoutActionState = { error: null };

type Address = {
  id: string;
  recipient_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  phone: string;
  is_default: boolean;
};

/**
 * Figma ①購入フロー「決済（チェックアウト）48:796」。
 * 左にお届け先・お支払い方法・要望、右に注文内容と合計。
 * 「注文を確定する」で place_order() → Stripe（キーがあれば）。
 */
export function CheckoutForm({
  lines,
  addresses,
  totals,
  paymentMode,
}: {
  lines: CartLine[];
  addresses: Address[];
  totals: { goods: number; printFee: number; shipping: number; total: number };
  paymentMode: PaymentMode;
}) {
  const [state, action, pending] = useActionState(placeOrderAction, initial);
  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0];

  return (
    <form action={action} className="flex flex-col gap-5 lg:flex-row">
      {state.orderId && <input type="hidden" name="orderId" value={state.orderId} />}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 text-brand" aria-hidden />
            <h2 className="text-[13px] font-bold text-ink">お届け先</h2>
            <Link href="/mypage/addresses" className="ml-auto text-[11px] text-brand hover:underline">
              追加・編集する
            </Link>
          </div>
          {addresses.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">
              お届け先がまだありません。
              <Link href="/mypage/addresses" className="font-semibold text-brand hover:underline">
                配送先を登録
              </Link>
              してから戻ってきてください。
            </p>
          ) : (
            addresses.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40"
              >
                <input
                  type="radio"
                  name="addressId"
                  value={a.id}
                  defaultChecked={a.id === defaultAddress?.id}
                  className="mt-0.5 accent-brand"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-semibold text-ink">{a.recipient_name} 様</span>
                  <span className="text-[11px] text-muted-foreground">
                    〒{a.postal_code} {a.prefecture}
                    {a.city}
                    {a.address_line}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">{a.phone}</span>
                </span>
              </label>
            ))
          )}
        </section>

        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-3.5 text-brand" aria-hidden />
            <h2 className="text-[13px] font-bold text-ink">お支払い方法</h2>
          </div>
          {paymentMode === "stripe" ? (
            <p className="text-[11.5px] text-muted-foreground">
              「注文を確定する」を押すと Stripe の決済ページに移ります。クレジットカード
              （VISA / Mastercard / JCB など）が使えます。支払いが済むと印刷の準備に入ります。
            </p>
          ) : paymentMode === "development" ? (
            <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2">
              <FlaskConical className="mt-0.5 size-3.5 flex-none text-warn" aria-hidden />
              <p className="text-[11px] text-warn">
                <span className="font-semibold">開発モード</span>：実際の請求を行わずに注文を確定します。
              </p>
            </div>
          ) : (
            <p role="alert" className="text-xs text-danger">現在お支払いを利用できません。しばらくしてからお試しください。</p>
          )}
        </section>

        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <h2 className="text-[13px] font-bold text-ink">配送・印刷に関するご希望</h2>
          <textarea
            name="note"
            rows={3}
            maxLength={500}
            placeholder="フィラメントの色味など、ご希望があればご記入ください"
            className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand"
          />
        </section>
      </div>

      <aside className="flex w-full flex-col gap-3 self-start rounded-xl border border-line bg-white p-5 lg:w-[340px]">
        <h2 className="text-[14px] font-bold text-ink">注文内容</h2>
        {lines.map((l) => {
          const image = workImageUrl(l.imagePath);
          return (
            <div key={l.id} className="flex items-center gap-2.5">
              <span className="flex size-10 flex-none items-center justify-center overflow-hidden rounded-lg border border-line bg-ground">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-4 text-line" aria-hidden />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[11px] font-medium text-ink">{l.workTitle}</span>
                <span className="num text-[10px] text-muted-foreground">
                  {l.sizeLabel} ／ 数量 {l.quantity}
                </span>
              </span>
              <span className="num text-[12px] font-semibold text-ink">{yen((l.price ?? 0) * l.quantity)}</span>
            </div>
          );
        })}

        <div className="border-t border-line" />
        <dl className="flex flex-col gap-1 text-[11.5px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">作品代金</dt>
            <dd className="num text-ink">{yen(totals.goods)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">印刷代行費</dt>
            <dd className="num text-ink">{yen(totals.printFee)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">送料</dt>
            <dd className="num text-ink">{yen(totals.shipping)}</dd>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <dt className="text-[13px] font-semibold text-ink">合計（税込）</dt>
            <dd className="num text-[20px] font-bold text-brand">{yen(totals.total)}</dd>
          </div>
        </dl>

        <Button type="submit" size="lg" className="w-full" disabled={pending || paymentMode === "unavailable" || addresses.length === 0 || lines.length === 0}>
          {pending ? "処理中…" : state.orderId ? "お支払いを再開する" : "注文を確定する"}
        </Button>
        {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
        {state.orderId && (
          <Link className="text-xs text-brand underline" href={`/mypage/orders/${state.orderId}`}>
            作成済みの注文を確認・取り消す
          </Link>
        )}
        <p className="text-[9.5px] leading-4 text-muted-foreground">
          「注文を確定する」を押すと利用規約に同意したものとみなされます。受注生産のため、
          支払い後のキャンセルはできません。
        </p>
      </aside>
    </form>
  );
}

import Link from "next/link";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/features/cart/queries";
import { listMyAddresses } from "@/features/addresses/queries";
import { Button } from "@/components/ui/button";
import { CartList } from "./cart-list";
import { CheckoutButton } from "./checkout-button";

export const metadata = { title: "カート" };

const SHIPPING_FEE = Number(process.env.DEFAULT_SHIPPING_FEE ?? 800);

export default async function CartPage() {
  const { user } = await requireUser();
  const [{ items, subtotal, hasBlocker }, addresses] = await Promise.all([
    getCart(user.id),
    listMyAddresses(user.id),
  ]);

  const total = subtotal + (items.length > 0 ? SHIPPING_FEE : 0);

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-5 px-6 py-6">
      <h1 className="text-lg font-bold text-ink">カート</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white py-16">
          <ShoppingCart className="size-8 text-line" aria-hidden />
          <p className="text-sm text-muted-foreground">カートは空です</p>
          <Button render={<Link href="/products" />} variant="outline">
            作品をさがす
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex-1">
            <CartList items={items} />
          </div>

          {/* 内訳（Figma 48:748） */}
          <aside className="flex h-fit w-full flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:w-80">
            <p className="text-sm font-bold text-ink">お支払い内訳</p>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">小計</dt>
                <dd className="num font-medium text-ink">¥{subtotal.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">印刷代行費</dt>
                <dd className="text-[11px] text-muted-foreground">作品価格に含まれます</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">送料</dt>
                <dd className="num font-medium text-ink">
                  ¥{SHIPPING_FEE.toLocaleString()}
                </dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                <dt className="text-[13px] font-semibold text-ink">合計（税込）</dt>
                <dd className="num text-xl font-bold text-brand">
                  ¥{total.toLocaleString()}
                </dd>
              </div>
            </dl>

            {hasBlocker && (
              <p className="flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[11px] leading-4 text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                購入できない明細があります。数量を減らすか削除してください。
              </p>
            )}

            <CheckoutButton addresses={addresses} disabled={hasBlocker} />
          </aside>
        </div>
      )}
    </div>
  );
}

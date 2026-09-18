import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/lib/cart/queries";
import { CartLineRow } from "@/components/cart/cart-line-row";
import { yen } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const metadata = { title: "カート" };

/** Figma ①購入フロー「カート 46:1976」。 */
export default async function CartPage() {
  await requireUser("/cart");
  const { lines, subtotal } = await getCart();

  // 在庫 null は無制限（受注生産）
  const buyable = lines.filter((l) => l.isListed && (l.stock === null || l.stock > 0));

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-4 sm:px-6 py-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="text-base font-bold text-ink">
          カート <span className="num text-[12px] text-muted-foreground">{lines.length}件</span>
        </h1>

        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
            <ShoppingCart className="size-6 text-line" aria-hidden />
            <p className="text-sm font-semibold text-ink">カートは空です</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/works">作品をさがす</Link>
            </Button>
          </div>
        ) : (
          lines.map((line) => <CartLineRow key={line.id} line={line} />)
        )}
      </div>

      {lines.length > 0 && (
        <aside className="flex w-full flex-col gap-3 self-start rounded-xl border border-line bg-white p-5 lg:w-80">
          <p className="text-[12px] font-semibold text-muted-foreground">お支払い金額</p>
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] text-ink">小計</span>
            <span className="num text-lg font-bold text-ink">{yen(subtotal)}</span>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            印刷代行費を含みます。送料は次の画面で確定します。
          </p>
          <Button asChild disabled={buyable.length === 0} className="mt-1 w-full">
            <Link href="/checkout">レジに進む</Link>
          </Button>
          {buyable.length !== lines.length && (
            <p className="text-[11px] text-danger">
              購入できない商品が含まれています。削除してから進んでください。
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";

import { addToCartAction, type CartActionState } from "@/lib/cart/actions";
import { Button } from "@/components/ui/button";

const initialState: CartActionState = { error: null };

/** 作品詳細の CTA。数量を選んでカートに入れる。 */
export function AddToCartForm({
  variantId,
  stock,
  signedIn,
}: {
  variantId: string | null;
  stock: number;
  signedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(addToCartAction, initialState);
  const [quantity, setQuantity] = useState(1);
  const max = Math.min(stock, 20);

  if (!variantId) {
    return (
      <p className="rounded-lg bg-ground px-3 py-2 text-[12px] text-muted-foreground">
        購入できるサイズがありません
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Button asChild className="w-full">
        <Link href="/login">ログインしてカートに追加</Link>
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold text-muted-foreground">数量</span>
        <div className="flex items-center gap-1 rounded-lg border border-line">
          <button
            type="button"
            aria-label="数量を減らす"
            className="px-2 py-1.5 text-muted-foreground disabled:opacity-40"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <span className="num w-6 text-center text-[13px] text-ink">{quantity}</span>
          <button
            type="button"
            aria-label="数量を増やす"
            className="px-2 py-1.5 text-muted-foreground disabled:opacity-40"
            disabled={quantity >= max}
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
        <span className="num text-[11px] text-muted-foreground">在庫 {stock}</span>
      </div>

      <Button type="submit" disabled={pending || stock <= 0} className="w-full">
        <ShoppingCart className="size-4" aria-hidden />
        {stock <= 0 ? "在庫がありません" : pending ? "追加しています..." : "カートに追加"}
      </Button>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}
      {state.ok && (
        <p className="text-[12px] text-ok">
          カートに追加しました。
          <Link href="/cart" className="ml-1 font-semibold underline">
            カートを見る
          </Link>
        </p>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, ImageIcon, Minus, Plus, Trash2 } from "lucide-react";

import {
  removeCartItemAction,
  updateCartQuantityAction,
  type CartActionState,
} from "@/lib/cart/actions";
import type { CartLine } from "@/lib/cart/queries";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";

const initialState: CartActionState = { error: null };

/**
 * カートの1行。数量の増減と削除はそれぞれ独立したフォームにして、
 * どちらもサーバー側で在庫と所有者を見てから書く。
 */
export function CartLineRow({ line }: { line: CartLine }) {
  const [qtyState, updateQuantity, updating] = useActionState(
    updateCartQuantityAction,
    initialState
  );
  const [removeState, removeItem, removing] = useActionState(removeCartItemAction, initialState);

  const image = workImageUrl(line.imagePath);
  const max = Math.min(20, line.stock);
  const unavailable = !line.isListed || line.stock <= 0;

  return (
    <div className="flex gap-3 rounded-xl border border-line bg-white p-3">
      <Link
        href={`/works/${line.workId}`}
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ground"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-line" aria-hidden />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/works/${line.workId}`} className="truncate text-[13px] font-semibold text-ink">
          {line.workTitle}
        </Link>
        <p className="text-[11px] text-muted-foreground">サイズ {line.sizeLabel}</p>

        {unavailable && (
          <p className="flex items-center gap-1 text-[11px] text-danger">
            <AlertTriangle className="size-3.5" aria-hidden />
            現在購入できません（在庫切れまたは出品停止）
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <form action={updateQuantity} className="flex items-center gap-1 rounded-lg border border-line">
            <input type="hidden" name="itemId" value={line.id} />
            <button
              type="submit"
              name="quantity"
              value={line.quantity - 1}
              aria-label="数量を減らす"
              disabled={updating || line.quantity <= 1}
              className="px-2 py-1.5 text-muted-foreground disabled:opacity-40"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="num w-6 text-center text-[13px] text-ink">{line.quantity}</span>
            <button
              type="submit"
              name="quantity"
              value={line.quantity + 1}
              aria-label="数量を増やす"
              disabled={updating || line.quantity >= max}
              className="px-2 py-1.5 text-muted-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </form>

          <span className="num text-sm font-bold text-ink">
            {yen((line.price ?? 0) * line.quantity)}
          </span>

          <form action={removeItem} className="ml-auto">
            <input type="hidden" name="itemId" value={line.id} />
            <button
              type="submit"
              disabled={removing}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden />
              削除
            </button>
          </form>
        </div>

        {(qtyState.error || removeState.error) && (
          <p className="text-[11px] text-danger">{qtyState.error ?? removeState.error}</p>
        )}
      </div>
    </div>
  );
}

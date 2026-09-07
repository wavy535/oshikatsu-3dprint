"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageIcon, Minus, Plus, Trash2 } from "lucide-react";
import { removeCartItem, updateCartItem } from "@/features/cart/actions";
import { Button } from "@/components/ui/button";

type CartItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stock: number | null;
  unavailableReason: string | null;
  products: { title: string; product_images: { image_url: string }[] } | null;
  filaments: { name: string; color_hex: string } | null;
  nui_sizes: { label: string } | null;
};

export function CartList({ items }: { items: CartItem[] }) {
  const [isPending, startTransition] = useTransition();

  function handleQuantityChange(id: string, quantity: number) {
    startTransition(async () => {
      const result = await updateCartItem({ id, quantity });
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeCartItem(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const image = item.products?.product_images?.[0]?.image_url;
        const max = Math.min(20, item.stock ?? 20);
        return (
          <div
            key={item.id}
            className="flex gap-3 rounded-xl border border-line bg-white p-3"
          >
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ground">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-5 text-line" aria-hidden />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-[13px] font-semibold text-ink">
                {item.products?.title}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {item.filaments && (
                  <>
                    <span
                      className="size-2.5 rounded-full border border-line"
                      style={{ backgroundColor: item.filaments.color_hex }}
                    />
                    {item.filaments.name}
                  </>
                )}
                {item.nui_sizes ? ` / ${item.nui_sizes.label}` : ""}
              </p>
              <p className="num text-[11px] text-muted-foreground">
                単価 ¥{item.unitPrice.toLocaleString()}
              </p>
              {item.unavailableReason && (
                <p className="flex items-center gap-1 text-[11px] text-danger">
                  <AlertTriangle className="size-3" aria-hidden />
                  {item.unavailableReason}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-line">
                <button
                  type="button"
                  aria-label="数量を減らす"
                  disabled={isPending || item.quantity <= 1}
                  onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                  className="flex size-7 items-center justify-center text-ink disabled:text-muted-foreground/50"
                >
                  <Minus className="size-3" aria-hidden />
                </button>
                <span className="num w-6 text-center text-[13px] font-semibold">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="数量を増やす"
                  disabled={isPending || item.quantity >= max}
                  onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                  className="flex size-7 items-center justify-center text-ink disabled:text-muted-foreground/50"
                >
                  <Plus className="size-3" aria-hidden />
                </button>
              </div>
              <span className="num text-sm font-bold text-ink">
                ¥{item.lineTotal.toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => handleRemove(item.id)}
              >
                <Trash2 />
                削除
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

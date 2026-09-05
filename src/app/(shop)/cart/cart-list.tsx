"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { removeCartItem, updateCartItem } from "@/features/cart/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CartItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  products: { title: string } | null;
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
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{item.products?.title}</p>
              <p className="text-sm text-muted-foreground">
                {item.filaments?.name}
                {item.nui_sizes ? ` / ${item.nui_sizes.label}` : ""}
              </p>
              <p className="text-sm">¥{item.unitPrice.toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={20}
                value={item.quantity}
                disabled={isPending}
                onChange={(e) =>
                  handleQuantityChange(item.id, Math.min(20, Math.max(1, Number(e.target.value))))
                }
                className="w-16"
              />
              <span className="w-24 text-right font-medium">
                ¥{item.lineTotal.toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => handleRemove(item.id)}
              >
                削除
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

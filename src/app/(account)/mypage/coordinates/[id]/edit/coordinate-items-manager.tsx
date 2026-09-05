"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCoordinateItems } from "@/features/coordinates/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Product = { id: string; title: string; base_price: number };

export function CoordinateItemsManager({
  coordinateId,
  products,
  initialSelected,
}: {
  coordinateId: string;
  products: Product[];
  initialSelected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [isPending, startTransition] = useTransition();

  function toggle(productId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setCoordinateItems({
        coordinateId,
        items: Array.from(selected).map((productId) => ({ productId })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("使用作品を保存しました");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">タグ付けできる公開中の作品がありません。</p>
      ) : (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={(v) => toggle(p.id, Boolean(v))}
              />
              <span className="flex-1">{p.title}</span>
              <span className="text-muted-foreground">¥{p.base_price.toLocaleString()}</span>
            </label>
          ))}
        </div>
      )}
      <Button size="sm" disabled={isPending} onClick={handleSave} className="self-start">
        使用作品を保存
      </Button>
    </div>
  );
}

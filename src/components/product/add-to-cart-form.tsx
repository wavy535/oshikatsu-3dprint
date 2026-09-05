"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addToCart } from "@/features/cart/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Filament = { id: number; name: string; color_hex: string; surcharge: number };
type NuiSize = { id: number; label: string };

export function AddToCartForm({
  productId,
  isLoggedIn,
  productSlug,
  filaments,
  nuiSizes,
  defaultFilamentId,
}: {
  productId: string;
  isLoggedIn: boolean;
  productSlug: string;
  filaments: Filament[];
  nuiSizes: NuiSize[];
  defaultFilamentId: number;
}) {
  const router = useRouter();
  const [filamentId, setFilamentId] = useState(defaultFilamentId);
  const [nuiSizeId, setNuiSizeId] = useState<number | undefined>(nuiSizes[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!isLoggedIn) {
      router.push(`/login?next=/products/${productSlug}`);
      return;
    }
    setPending(true);
    const result = await addToCart({
      productId,
      filamentId,
      nuiSizeId,
      quantity,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("カートに追加しました");
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <p className="mb-2 text-sm font-medium">色を選択</p>
        <RadioGroup
          value={String(filamentId)}
          onValueChange={(v) => setFilamentId(Number(v))}
          className="flex flex-col gap-2"
        >
          {filaments.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={String(f.id)} />
              <span
                className="inline-block size-3 rounded-full border"
                style={{ backgroundColor: f.color_hex }}
              />
              {f.name}
              {f.surcharge > 0 && (
                <span className="text-xs text-muted-foreground">
                  （+¥{f.surcharge.toLocaleString()}）
                </span>
              )}
            </label>
          ))}
        </RadioGroup>
      </div>

      {nuiSizes.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium">対応サイズ</p>
          <Select
            value={nuiSizeId != null ? String(nuiSizeId) : undefined}
            onValueChange={(v) => setNuiSizeId(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nuiSizes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-sm font-medium">数量</p>
        <Input
          type="number"
          min={1}
          max={20}
          value={quantity}
          onChange={(e) => setQuantity(Math.min(20, Math.max(1, Number(e.target.value))))}
          className="w-20"
        />
      </div>

      <Button type="button" disabled={pending} onClick={handleSubmit}>
        {pending ? "追加中..." : "カートに入れる"}
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Heart, Minus, Package, Plus, Share2, ShoppingCart, Truck, Wallet } from "lucide-react";
import { addToCart } from "@/features/cart/actions";
import { toggleFavorite } from "@/features/products/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SizeVariant = {
  nuiSizeId: number;
  label: string;
  price: number;
  stock: number;
  estPrintMin: number | null;
  isActive: boolean;
  unavailableReason: string | null;
};

type Filament = { id: number; name: string; color_hex: string; surcharge: number };

function formatPrintTime(min: number | null) {
  if (!min) return null;
  const h = Math.round(min / 60);
  return h >= 1 ? `印刷 約${h}時間` : `印刷 約${min}分`;
}

/**
 * Figma ①購入フロー「作品詳細 60:8」の InfoPanel。
 * サイズ展開（10/15/20cm）を選ぶと価格・在庫・発送目安が切り替わる。
 * マイぬいのサイズが登録されていれば初期選択され、取扱のないサイズは選べない。
 */
export function SizeVariantPicker({
  productId,
  productSlug,
  isLoggedIn,
  variants,
  filaments,
  defaultFilamentId,
  initialSizeId,
  autoSelectedByNui,
  initialFavorited,
  partCount,
}: {
  productId: string;
  productSlug: string;
  isLoggedIn: boolean;
  variants: SizeVariant[];
  filaments: Filament[];
  defaultFilamentId: number;
  initialSizeId: number | null;
  autoSelectedByNui: string | null;
  initialFavorited: boolean;
  partCount: number;
}) {
  const router = useRouter();
  const selectable = variants.filter((v) => v.isActive && v.stock > 0);
  const [sizeId, setSizeId] = useState<number | null>(
    initialSizeId ?? selectable[0]?.nuiSizeId ?? null
  );
  const [filamentId, setFilamentId] = useState(defaultFilamentId);
  const [quantity, setQuantity] = useState(1);
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  const selected = variants.find((v) => v.nuiSizeId === sizeId) ?? null;
  const filament = filaments.find((f) => f.id === filamentId);
  const unitPrice = (selected?.price ?? 0) + (filament?.surcharge ?? 0);
  const maxQty = Math.min(20, selected?.stock ?? 0);

  function pickSize(v: SizeVariant) {
    setSizeId(v.nuiSizeId);
    setQuantity((q) => Math.min(q, Math.max(1, Math.min(20, v.stock))));
  }

  async function handleAddToCart() {
    if (!isLoggedIn) {
      router.push(`/login?next=/products/${productSlug}`);
      return;
    }
    if (!selected) {
      toast.error("サイズを選択してください");
      return;
    }
    setPending(true);
    const result = await addToCart({
      productId,
      filamentId,
      nuiSizeId: selected.nuiSizeId,
      quantity,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("カートに追加しました");
    router.refresh();
  }

  async function handleFavorite() {
    if (!isLoggedIn) {
      router.push(`/login?next=/products/${productSlug}`);
      return;
    }
    const result = await toggleFavorite(productId, productSlug);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFavorited(result.data.favorited);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* サイズ展開 */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold text-ink">対応ぬいサイズを選ぶ</p>
          {autoSelectedByNui && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              マイぬい {autoSelectedByNui} で自動選択
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => {
            const disabled = !v.isActive || v.stock <= 0;
            const on = v.nuiSizeId === sizeId;
            return (
              <button
                key={v.nuiSizeId}
                type="button"
                disabled={disabled}
                onClick={() => pickSize(v)}
                aria-pressed={on}
                title={
                  !v.isActive
                    ? (v.unavailableReason ?? "この作品では取り扱いがありません")
                    : v.stock <= 0
                      ? "在庫切れ"
                      : undefined
                }
                className={cn(
                  "flex min-w-24 flex-1 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-colors",
                  disabled
                    ? "cursor-not-allowed border-line bg-ground text-muted-foreground"
                    : on
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-white hover:border-brand/50"
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-bold",
                    disabled ? "text-muted-foreground" : on ? "text-brand" : "text-ink"
                  )}
                >
                  {v.label}
                </span>
                <span className="num text-[11px] font-semibold text-ink">
                  {!v.isActive ? "取扱なし" : `¥${v.price.toLocaleString()}`}
                </span>
                <span className="text-[8.5px] text-muted-foreground">
                  {!v.isActive
                    ? (v.unavailableReason ?? "サイズ上限超過")
                    : v.stock > 0
                      ? `在庫${v.stock}点`
                      : "在庫切れ"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 価格 */}
      <div className="flex items-baseline gap-2">
        <p className="num text-[26px] leading-10 font-bold text-brand">
          ¥{unitPrice.toLocaleString()}
        </p>
        <p className="text-[10.5px] text-muted-foreground">
          ({selected?.label ?? "サイズ未選択"}・税込／送料別)
        </p>
      </div>

      {/* 色（フィラメント） */}
      {filaments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-ink">色・素材</p>
          <div className="flex flex-wrap gap-2">
            {filaments.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilamentId(f.id)}
                aria-pressed={f.id === filamentId}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                  f.id === filamentId
                    ? "border-brand bg-brand-soft text-accent-foreground"
                    : "border-line bg-white text-ink hover:border-brand/50"
                )}
              >
                <span
                  className="size-2.5 rounded-full border border-line"
                  style={{ backgroundColor: f.color_hex }}
                />
                {f.name}
                {f.surcharge > 0 && (
                  <span className="num text-muted-foreground">
                    +¥{f.surcharge.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 数量 */}
      <div className="flex items-center gap-3">
        <p className="text-[13px] font-semibold text-ink">数量</p>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white">
          <button
            type="button"
            aria-label="数量を減らす"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex size-7 items-center justify-center text-ink disabled:text-muted-foreground/50"
          >
            <Minus className="size-3" aria-hidden />
          </button>
          <span className="num w-6 text-center text-[13px] font-semibold">{quantity}</span>
          <button
            type="button"
            aria-label="数量を増やす"
            disabled={quantity >= maxQty}
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            className="flex size-7 items-center justify-center text-ink disabled:text-muted-foreground/50"
          >
            <Plus className="size-3" aria-hidden />
          </button>
        </div>
        <span className="flex-1" />
        {selected && (
          <p
            className={cn(
              "text-[10.5px]",
              selected.stock > 0 ? "text-ok" : "text-danger"
            )}
          >
            {selected.stock > 0
              ? `${selected.label} 在庫あり（残り${selected.stock}点）`
              : `${selected.label} は在庫切れです`}
          </p>
        )}
      </div>

      {/* 購入 */}
      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="flex-1"
          disabled={pending || !selected || selected.stock <= 0}
          onClick={handleAddToCart}
        >
          <ShoppingCart />
          {pending ? "追加中..." : "カートに追加する"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={favorited ? "お気に入りから外す" : "お気に入りに追加"}
          onClick={handleFavorite}
        >
          <Heart className={cn(favorited && "fill-danger text-danger")} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="作品を共有"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              toast.success("作品のURLをコピーしました");
            } catch {
              toast.error("URLのコピーに失敗しました");
            }
          }}
        >
          <Share2 />
        </Button>
      </div>

      {/* 発送目安 */}
      <dl className="flex flex-col gap-1.5 rounded-lg bg-ground px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Truck className="size-3.5 text-muted-foreground" aria-hidden />
          <dt className="text-[10.5px] text-muted-foreground">
            発送目安{selected ? `（${selected.label}）` : ""}
          </dt>
          <span className="flex-1" />
          <dd className="text-[10.5px] font-medium text-ink">
            {formatPrintTime(selected?.estPrintMin ?? null)
              ? `${formatPrintTime(selected?.estPrintMin ?? null)} → 7〜10営業日で発送`
              : "7〜10営業日で発送"}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Package className="size-3.5 text-muted-foreground" aria-hidden />
          <dt className="text-[10.5px] text-muted-foreground">印刷・品質管理</dt>
          <span className="flex-1" />
          <dd className="text-[10.5px] font-medium text-ink">
            OshiNest運営が代行{partCount > 1 ? `（${partCount}パーツ・組立図同梱）` : ""}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="size-3.5 text-muted-foreground" aria-hidden />
          <dt className="text-[10.5px] text-muted-foreground">支払い方法</dt>
          <span className="flex-1" />
          <dd className="text-[10.5px] font-medium text-ink">クレジットカード</dd>
        </div>
      </dl>
    </div>
  );
}

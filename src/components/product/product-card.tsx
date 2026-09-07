import Link from "next/link";
import { Heart, ImageIcon, Star } from "lucide-react";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  review_count: number;
  review_avg: number;
  favorite_count: number;
  creator_handle: string;
  creator_display_name: string;
  image_url: string | null;
  /** search_products が返すサイズ展開の本数。2 以上なら価格を「〜」表記にする */
  variant_count?: number;
};

/**
 * Figma ①購入フロー WorkCard。サイズ展開を持つ作品では base_price が
 * 「最小サイズの価格」になるため、価格は "〜" 始まりで見せる。
 */
export function ProductCard({
  product,
  priceFrom = (product.variant_count ?? 0) > 1,
}: {
  product: ProductCardData;
  priceFrom?: boolean;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-[0_6px_20px_rgba(31,35,40,0.08)]"
    >
      <div className="relative flex aspect-4/3 w-full items-center justify-center bg-ground">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.title}
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-6 text-[color:var(--line)]" aria-hidden />
        )}
        <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-white/90 shadow-sm">
          <Heart className="size-3.5 text-muted-foreground" aria-hidden />
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-[13px] leading-5 font-semibold text-ink">
          {product.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {product.creator_display_name}
        </p>
        <div className="flex items-center gap-1 pt-0.5">
          <span className="num text-[15px] font-bold text-brand">
            {priceFrom ? "〜" : ""}¥{product.base_price.toLocaleString()}
          </span>
          <span className="flex-1" />
          {product.review_count > 0 ? (
            <>
              <Star className="size-3 fill-star text-star" aria-hidden />
              <span className="num text-[11px] text-muted-foreground">
                {product.review_avg.toFixed(1)}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">レビューなし</span>
          )}
        </div>
      </div>
    </Link>
  );
}

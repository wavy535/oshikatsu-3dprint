import { yen } from "@/lib/format";
import Link from "next/link";
import { Heart, ImageIcon, Star } from "lucide-react";
import type { WorkCardItem } from "@/lib/works/list-options";
import { workImageUrl } from "@/lib/storage";


/**
 * 作品カード。Figma ⓪共通 / 検索結果の WorkCard。
 * サイズ展開が2本以上ある作品は価格を「¥1,400〜」と出す。
 */
export function WorkCard({ item, eager = false }: { item: WorkCardItem; eager?: boolean }) {
  const image = workImageUrl(item.imagePath);

  return (
    <Link
      prefetch={false}
      href={`/works/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-ground">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading={eager ? "eager" : "lazy"}
            src={image}
            alt=""
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <ImageIcon className="size-6 text-line" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-[13px] leading-5 font-semibold text-ink">{item.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{item.creatorName}</p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="num text-sm font-bold text-ink">
            {yen(item.minPrice)}
            {item.hasRange && <span className="text-[11px] font-medium">〜</span>}
          </span>
          {item.isPriceDropped && (
            <span className="rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger">
              値下げ中
            </span>
          )}
          {!item.hasStock && (
            <span className="rounded bg-ground px-1.5 py-0.5 text-[10px] text-muted-foreground">
              在庫なし
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" aria-hidden />
            <span className="num">{item.favoriteCount}</span>
          </span>
          {item.reviewCount > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-star text-star" aria-hidden />
              <span className="num">{item.avgRating?.toFixed(1)}</span>
              <span>({item.reviewCount})</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

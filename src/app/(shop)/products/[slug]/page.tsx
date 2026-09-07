import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ImageIcon, MessageSquare, Star } from "lucide-react";
import { getOptionalUser } from "@/lib/auth/guards";
import { getProductBySlug, isFavorited, listCategories } from "@/features/products/queries";
import { listProductAssets } from "@/features/products/queries";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { listProductReviews } from "@/features/reviews/queries";
import { listCoordinatesByProduct } from "@/features/coordinates/queries";
import {
  SizeVariantPicker,
  type SizeVariant,
} from "@/components/product/size-variant-picker";
import { ReviewList } from "@/components/review/review-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AskQuestionForm } from "./ask-question-form";

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`評価 ${value.toFixed(1)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={n <= Math.round(value) ? "fill-star text-star" : "text-line"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    notFound();
  }

  const { user } = await getOptionalUser();
  const [favorited, reviews, coordinates, nuiSizes, categories, assets] = await Promise.all([
    user ? isFavorited(user.id, product.id) : Promise.resolve(false),
    listProductReviews(product.id),
    listCoordinatesByProduct(product.id),
    listNuiSizes(),
    listCategories(),
    listProductAssets(product.id).catch(() => []),
  ]);
  const isOwnProduct = user?.id === product.creator_id;

  // マイぬいのサイズがこの作品で買えるなら初期選択にする（Figma 2067:1186）
  let initialSizeId: number | null = null;
  let autoSelectedByNui: string | null = null;
  if (user) {
    const nuis = await listMyNuis(user.id);
    const primary = nuis.find((n) => n.is_primary) ?? nuis[0];
    if (primary) {
      const match = product.product_size_variants.find(
        (v) => v.nui_size_id === primary.nui_size_id && v.is_active && v.stock > 0
      );
      if (match) {
        initialSizeId = match.nui_size_id;
        autoSelectedByNui = primary.nui_sizes?.label ?? null;
      }
    }
  }

  const sizeLabel = (id: number) => nuiSizes.find((s) => s.id === id)?.label ?? `${id}`;
  // 並び順は nui_sizes マスタの sort_order に従う
  const sizeOrder = (id: number) => {
    const i = nuiSizes.findIndex((s) => s.id === id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const variants: SizeVariant[] = [...product.product_size_variants]
    .sort((a, b) => sizeOrder(a.nui_size_id) - sizeOrder(b.nui_size_id))
    .map((v) => ({
      nuiSizeId: v.nui_size_id,
      label: sizeLabel(v.nui_size_id),
      price: v.price,
      stock: v.stock,
      estPrintMin: v.est_print_min,
      isActive: v.is_active,
      unavailableReason: v.unavailable_reason,
    }));

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order);
  const creator = product.profiles;
  const category = categories.find((c) => c.id === product.category_id);
  const partCount = assets.reduce((n, a) => n + (a.quantity_per_item ?? 1), 0);

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-col px-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1.5 py-2 text-[11px] text-muted-foreground">
        <Link href="/" className="hover:text-ink">
          ホーム
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        {category && (
          <>
            <Link href={`/products?category=${category.id}`} className="hover:text-ink">
              {category.name}
            </Link>
            <ChevronRight className="size-3" aria-hidden />
          </>
        )}
        <span className="text-ink">{product.title}</span>
      </nav>

      <div className="flex flex-col gap-6 pb-8 lg:flex-row">
        {/* 左: 画像とレビュー */}
        <div className="flex flex-col gap-3.5 lg:w-[600px]">
          <div className="flex h-80 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
            {images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[0].image_url}
                alt={product.title}
                className="size-full object-contain"
              />
            ) : (
              <ImageIcon className="size-11 text-line" aria-hidden />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.slice(0, 5).map((image, i) => (
                <div
                  key={image.id}
                  className={`flex h-16 flex-1 items-center justify-center overflow-hidden rounded-lg bg-white ${
                    i === 0 ? "border-2 border-brand" : "border border-line"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.image_url} alt="" className="size-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-ink">レビュー</p>
              <Stars value={product.review_avg} size={14} />
              <p className="num text-[13px] font-semibold text-ink">
                {product.review_avg.toFixed(1)}
              </p>
              <p className="num text-[11px] text-muted-foreground">
                ({product.review_count}件)
              </p>
            </div>
            <ReviewList reviews={reviews.slice(0, 4)} />
          </div>

          {product.description && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
              <p className="text-sm font-bold text-ink">作品について</p>
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink">
                {product.description}
              </p>
            </div>
          )}

          {coordinates.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
              <p className="text-sm font-bold text-ink">この作品を使ったコーデ</p>
              <div className="grid grid-cols-4 gap-2">
                {coordinates.map((c) => (
                  <Link
                    key={c!.id}
                    href={`/coordinates/${c!.id}`}
                    className="aspect-square overflow-hidden rounded-lg bg-ground"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c!.cover_image_url}
                      alt={c!.title}
                      className="size-full object-cover"
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右: 購入パネル */}
        <div className="flex flex-1 flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <h1 className="text-lg font-bold text-ink">{product.title}</h1>
          <div className="flex items-center gap-1.5">
            <Stars value={product.review_avg} />
            <p className="num text-xs font-semibold text-ink">
              {product.review_avg.toFixed(1)}
            </p>
            <p className="text-[10.5px] text-muted-foreground">
              ・{product.review_count}件のレビュー
            </p>
          </div>

          {creator && (
            <div className="flex items-center gap-2.5 rounded-lg bg-ground px-3 py-2">
              <Link href={`/creators/${creator.handle}`} className="flex items-center gap-2.5">
                <Avatar className="size-7.5">
                  {creator.avatar_url ? <AvatarImage src={creator.avatar_url} alt="" /> : null}
                  <AvatarFallback className="text-[10px]">
                    {creator.display_name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-semibold text-ink">
                  {creator.display_name}
                </span>
              </Link>
              <span className="flex-1" />
              <Button
                render={<Link href={`/creators/${creator.handle}`} />}
                variant="outline"
                size="sm"
              >
                プロフィール
              </Button>
            </div>
          )}

          <SizeVariantPicker
            productId={product.id}
            productSlug={product.slug}
            isLoggedIn={Boolean(user)}
            variants={variants}
            filaments={product.product_filaments.flatMap((r) =>
              r.filaments ? [r.filaments] : []
            )}
            defaultFilamentId={
              product.product_filaments.find((r) => r.is_default)?.filaments?.id ??
              product.product_filaments[0]?.filaments?.id ??
              0
            }
            initialSizeId={initialSizeId}
            autoSelectedByNui={autoSelectedByNui}
            initialFavorited={favorited}
            partCount={partCount}
          />

          {!isOwnProduct && (
            <div id="qa" className="flex flex-col gap-2 border-t border-line pt-2.5 scroll-mt-24">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-ink" aria-hidden />
                <p className="text-xs font-semibold text-ink">Q&A・オーダーメイド相談</p>
                <span className="flex-1" />
                <Button
                  render={<Link href={`/custom-orders/new?product=${product.slug}`} />}
                  variant="outline"
                  size="sm"
                >
                  オーダーメイド相談
                </Button>
              </div>
              <AskQuestionForm productId={product.id} isLoggedIn={Boolean(user)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

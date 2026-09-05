import { notFound } from "next/navigation";
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/guards";
import { getProductBySlug, isFavorited } from "@/features/products/queries";
import { listProductReviews } from "@/features/reviews/queries";
import { listCoordinatesByProduct } from "@/features/coordinates/queries";
import { AddToCartForm } from "@/components/product/add-to-cart-form";
import { FavoriteButton } from "@/components/product/favorite-button";
import { NuiSizeBadge } from "@/components/product/nui-size-badge";
import { ReviewList } from "@/components/review/review-list";
import { AskQuestionForm } from "./ask-question-form";

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
  const favorited = user ? await isFavorited(user.id, product.id) : false;
  const reviews = await listProductReviews(product.id);
  const coordinates = await listCoordinatesByProduct(product.id);
  const isOwnProduct = user?.id === product.creator_id;

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order);
  const creator = product.profiles;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted">
            {images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0].image_url} alt={product.title} className="size-full object-cover" />
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(1).map((image) => (
                <div key={image.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.image_url} alt="" className="size-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{product.title}</h1>
            {creator && (
              <Link
                href={`/creators/${creator.handle}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                by {creator.display_name}
              </Link>
            )}
          </div>

          <p className="text-2xl font-bold">¥{product.base_price.toLocaleString()}</p>

          {product.review_count > 0 && (
            <p className="text-sm text-muted-foreground">
              ★{product.review_avg.toFixed(1)}（{product.review_count}件のレビュー）
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {product.product_nui_sizes.map((r) =>
              r.nui_sizes ? <NuiSizeBadge key={r.nui_sizes.id} label={r.nui_sizes.label} /> : null
            )}
          </div>

          <AddToCartForm
            productId={product.id}
            productSlug={product.slug}
            isLoggedIn={Boolean(user)}
            filaments={product.product_filaments.flatMap((r) => (r.filaments ? [r.filaments] : []))}
            nuiSizes={product.product_nui_sizes.flatMap((r) => (r.nui_sizes ? [r.nui_sizes] : []))}
            defaultFilamentId={
              product.product_filaments.find((r) => r.is_default)?.filaments?.id ??
              product.product_filaments[0]?.filaments?.id ??
              0
            }
          />

          <FavoriteButton
            productId={product.id}
            productSlug={product.slug}
            isLoggedIn={Boolean(user)}
            initialFavorited={favorited}
          />

          <p className="whitespace-pre-wrap text-sm">{product.description}</p>

          {!isOwnProduct && (
            <AskQuestionForm productId={product.id} isLoggedIn={Boolean(user)} />
          )}
        </div>
      </div>

      {coordinates.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">この作品を使ったコーデ</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {coordinates.map((c) => (
              <Link key={c!.id} href={`/coordinates/${c!.id}`} className="aspect-square overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c!.cover_image_url} alt={c!.title} className="size-full object-cover" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">レビュー</h2>
        <ReviewList reviews={reviews} />
      </div>
    </div>
  );
}

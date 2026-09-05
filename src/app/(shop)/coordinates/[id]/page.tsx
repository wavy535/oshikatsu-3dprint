import { notFound } from "next/navigation";
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/guards";
import { getCoordinate, isCoordinateLiked } from "@/features/coordinates/queries";
import { CoordinateCanvas } from "@/components/coordinate/coordinate-canvas";
import { LikeButton } from "./like-button";

export default async function CoordinateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coordinate = await getCoordinate(id);
  if (!coordinate) {
    notFound();
  }

  const { user } = await getOptionalUser();
  if (!coordinate.is_public && coordinate.user_id !== user?.id) {
    notFound();
  }
  const liked = user ? await isCoordinateLiked(id, user.id) : false;

  const images = [...coordinate.coordinate_images].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{coordinate.title}</h1>
          <p className="text-sm text-muted-foreground">by {coordinate.profiles?.display_name}</p>
        </div>
        <LikeButton
          coordinateId={coordinate.id}
          isLoggedIn={Boolean(user)}
          initialLiked={liked}
          initialCount={coordinate.like_count}
        />
      </div>

      <CoordinateCanvas
        coverImageUrl={coordinate.cover_image_url}
        title={coordinate.title}
        items={coordinate.coordinate_items}
      />

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img) => (
            <div key={img.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt="" className="size-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {coordinate.body && <p className="whitespace-pre-wrap text-sm">{coordinate.body}</p>}

      {coordinate.coordinate_items.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">使用作品</h2>
          <div className="flex flex-col gap-2">
            {coordinate.coordinate_items.map((item) =>
              item.products ? (
                <Link
                  key={item.id}
                  href={`/products/${item.products.slug}`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted"
                >
                  <span>{item.products.title}</span>
                  <span>¥{item.products.base_price.toLocaleString()}</span>
                </Link>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

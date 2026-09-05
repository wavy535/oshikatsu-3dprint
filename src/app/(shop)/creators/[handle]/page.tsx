import { notFound } from "next/navigation";
import { getCreatorByHandle, listPublishedProductsByCreator } from "@/features/products/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProductGrid } from "@/components/product/product-grid";

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const creator = await getCreatorByHandle(handle);
  if (!creator) {
    notFound();
  }

  const products = await listPublishedProductsByCreator(creator.id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <Avatar size="lg">
          <AvatarImage src={creator.avatar_url ?? undefined} alt={creator.display_name} />
          <AvatarFallback>{creator.display_name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-semibold">{creator.display_name}</h1>
          {creator.bio && <p className="text-sm text-muted-foreground">{creator.bio}</p>}
        </div>
      </div>

      <ProductGrid
        products={products.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          base_price: p.base_price,
          review_count: p.review_count,
          review_avg: p.review_avg,
          favorite_count: p.favorite_count,
          creator_handle: creator.handle,
          creator_display_name: creator.display_name,
          image_url:
            [...p.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null,
        }))}
      />
    </div>
  );
}

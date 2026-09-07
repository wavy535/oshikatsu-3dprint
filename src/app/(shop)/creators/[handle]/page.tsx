import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, MessageSquare } from "lucide-react";
import { getOptionalUser } from "@/lib/auth/guards";
import {
  getCreatorByHandle,
  listPublishedProductsByCreator,
} from "@/features/products/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

  const [products, { user }] = await Promise.all([
    listPublishedProductsByCreator(creator.id),
    getOptionalUser(),
  ]);
  const isSelf = user?.id === creator.id;

  const soldSum = products.reduce((n, p) => n + (p.favorite_count ?? 0), 0);
  const topProduct = products[0];

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-5 px-6 py-6">
      {/* Figma ③やりとり・相談「クリエイター公開プロフィール 61:77」 */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row sm:items-center">
        <Avatar size="lg" className="size-14">
          <AvatarImage src={creator.avatar_url ?? undefined} alt={creator.display_name} />
          <AvatarFallback>{creator.display_name.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-lg font-bold text-ink">{creator.display_name}</h1>
          <p className="num text-[11.5px] text-muted-foreground">
            投稿{products.length}作品 ・ お気に入り{soldSum}
          </p>
          {creator.bio && (
            <p className="text-[12.5px] leading-5 text-muted-foreground">{creator.bio}</p>
          )}
        </div>

        {/* メッセージ・相談はどちらも「作品」に紐づけて始める仕様なので、
            公開作品がある場合だけ入口を出す */}
        {!isSelf && topProduct && (
          <div className="flex flex-wrap gap-2">
            <Button
              render={<Link href={`/products/${topProduct.slug}#qa`} />}
              variant="outline"
            >
              <MessageSquare />
              作品について質問する
            </Button>
            <Button
              render={<Link href={`/custom-orders/new?product=${topProduct.slug}`} />}
            >
              <Edit />
              オーダーメイド相談
            </Button>
          </div>
        )}
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
          variant_count: p.product_size_variants.filter((v) => v.is_active).length,
          image_url:
            [...p.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]
              ?.image_url ?? null,
        }))}
      />
    </div>
  );
}

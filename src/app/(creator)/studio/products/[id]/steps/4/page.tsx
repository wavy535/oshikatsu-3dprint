import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import { getProductDraft } from "@/features/products/queries";
import { StepNav } from "@/components/product/step-nav";
import { ThumbnailPicker } from "./thumbnail-picker";

export const metadata = { title: "作品を投稿（STEP4 サムネイル）" };

export default async function Step4Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const product = await getProductDraft(id, user.id);
  if (!product) notFound();

  const images = [...product.product_images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ id: i.id, image_url: i.image_url }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-ink">{product.title}</h1>
        <StepNav current={4} productId={product.id} />
      </div>
      <ThumbnailPicker
        productId={product.id}
        images={images}
        status={product.status}
      />
    </div>
  );
}

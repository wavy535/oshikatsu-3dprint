import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import {
  getMyProductForEdit,
  listCategories,
  listFilaments,
  listProductAssets,
  listProductImages,
  listTags,
} from "@/features/products/queries";
import { listNuiSizes } from "@/features/nuis/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm } from "../../product-form";
import { AssetManager } from "./asset-manager";
import { ImageManager } from "./image-manager";
import { SubmitReviewButton } from "./submit-review-button";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  in_review: "審査中",
  published: "公開中",
  rejected: "却下",
  archived: "販売停止",
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();

  const [product, assets, images, categories, tags, nuiSizes, filaments] = await Promise.all([
    getMyProductForEdit(id, user.id).catch(() => null),
    listProductAssets(id),
    listProductImages(id),
    listCategories(),
    listTags(),
    listNuiSizes(),
    listFilaments(),
  ]);

  if (!product) {
    notFound();
  }

  const defaultFilamentId =
    product.product_filaments.find((f) => f.is_default)?.filament_id ??
    product.product_filaments[0]?.filament_id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{product.title}</h1>
          <Badge variant="outline">{STATUS_LABEL[product.status] ?? product.status}</Badge>
        </div>
        {(product.status === "draft" || product.status === "rejected") && (
          <SubmitReviewButton productId={id} />
        )}
      </div>

      {product.status === "rejected" && product.rejected_reason && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          却下理由: {product.rejected_reason}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>制作データ（STL）</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetManager productId={id} assets={assets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品画像</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageManager productId={id} images={images} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>作品情報</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            productId={id}
            master={{ categories, tags, nuiSizes, filaments }}
            defaultValues={{
              title: product.title,
              description: product.description,
              categoryId: product.category_id,
              basePrice: product.base_price,
              nuiSizeIds: product.product_nui_sizes.map((r) => r.nui_size_id),
              tagIds: product.product_tags.map((r) => r.tag_id),
              filamentIds: product.product_filaments.map((r) => r.filament_id),
              defaultFilamentId: defaultFilamentId!,
              sizeWMm: product.size_w_mm ?? undefined,
              sizeDMm: product.size_d_mm ?? undefined,
              sizeHMm: product.size_h_mm ?? undefined,
              estWeightG: product.est_weight_g ?? undefined,
              printNote: product.print_note ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

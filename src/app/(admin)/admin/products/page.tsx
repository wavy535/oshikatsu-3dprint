import { requireAdmin } from "@/lib/auth/guards";
import { adminGetProductForReview, listProductsInReview } from "@/features/admin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { StlDownloadButton } from "@/components/admin/stl-download-button";
import { ReviewActions } from "./review-actions";

export default async function AdminProductsPage() {
  await requireAdmin();
  const products = await listProductsInReview();
  const details = await Promise.all(products.map((p) => adminGetProductForReview(p.id)));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">作品審査</h1>
      {details.length === 0 && (
        <p className="text-sm text-muted-foreground">審査待ちの作品はありません</p>
      )}
      <div className="flex flex-col gap-4">
        {details.map((product) =>
          product ? (
            <Card key={product.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{product.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.profiles?.display_name} / ¥{product.base_price.toLocaleString()}
                    </p>
                  </div>
                  <ReviewActions productId={product.id} />
                </div>
                <p className="whitespace-pre-wrap text-sm">{product.description}</p>
                <div className="flex flex-wrap gap-2">
                  {[...product.product_images]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={img.id}
                        src={img.image_url}
                        alt=""
                        className="size-24 rounded-lg object-cover"
                      />
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.product_assets.map((asset) => (
                    <StlDownloadButton
                      key={asset.id}
                      assetId={asset.id}
                      fileName={asset.original_name}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null
        )}
      </div>
    </div>
  );
}

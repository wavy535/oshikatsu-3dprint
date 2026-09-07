import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import {
  getMyProductForEdit,
  listProductAssets,
  listProductImages,
} from "@/features/products/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StepNav } from "@/components/product/step-nav";
import { AssetManager } from "./asset-manager";
import { ImageManager } from "./image-manager";
import { SubmitReviewButton } from "./submit-review-button";

export const metadata = { title: "作品の編集" };

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  in_review: "審査中",
  published: "公開中",
  rejected: "却下",
  archived: "販売停止",
};

/**
 * 作品の編集ハブ。
 * 作品情報・価格・サイズ展開の編集は 4STEP フロー側が唯一の入口になったので、
 * ここは「STEPへの入口」と「ファイルの出し入れ」だけを持つ。
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();

  const [product, assets, images] = await Promise.all([
    getMyProductForEdit(id, user.id).catch(() => null),
    listProductAssets(id),
    listProductImages(id),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/studio/products"
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← 作品管理
        </Link>
        <h1 className="text-lg font-bold text-ink">{product.title}</h1>
        <Badge variant="outline">{STATUS_LABEL[product.status] ?? product.status}</Badge>
        {(product.status === "draft" || product.status === "rejected") && (
          <span className="ml-auto">
            <SubmitReviewButton productId={id} />
          </span>
        )}
      </div>

      {product.status === "rejected" && product.rejected_reason && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
          却下理由: {product.rejected_reason}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-bold text-ink">投稿ステップ</p>
        <p className="text-[11.5px] text-muted-foreground">
          作品名・価格・サイズ展開・サムネイルは各ステップから編集します。
        </p>
        <StepNav current={0} productId={id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3Dデータ（パーツ）</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetManager productId={id} assets={assets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>作品画像</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageManager productId={id} images={images} />
        </CardContent>
      </Card>
    </div>
  );
}

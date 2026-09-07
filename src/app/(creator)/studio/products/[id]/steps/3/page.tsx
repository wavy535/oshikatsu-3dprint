import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import {
  getProductDraft,
  listCategories,
  listFilaments,
  listTags,
} from "@/features/products/queries";
import { getMyCreatorProfile } from "@/features/auth/queries";
import { listNuiSizes } from "@/features/nuis/queries";
import { StepNav } from "@/components/product/step-nav";
import { ProductInfoForm, type VariantRow } from "./product-info-form";

export const metadata = { title: "作品を投稿（STEP3 作品情報）" };

export default async function Step3Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const [product, categories, tags, filaments, nuiSizes, creatorProfile] =
    await Promise.all([
      getProductDraft(id, user.id),
      listCategories(),
      listTags(),
      listFilaments(),
      listNuiSizes(),
      getMyCreatorProfile(user.id),
    ]);
  if (!product) notFound();

  const sizeOrder = (id: number) => {
    const i = nuiSizes.findIndex((s) => s.id === id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const variants: VariantRow[] = [...product.product_size_variants]
    .sort((a, b) => sizeOrder(a.nui_size_id) - sizeOrder(b.nui_size_id))
    .map((v) => ({
      nuiSizeId: v.nui_size_id,
      label: nuiSizes.find((s) => s.id === v.nui_size_id)?.label ?? `${v.nui_size_id}`,
      price: v.price,
      stock: v.stock,
      agencyFee: v.agency_fee,
      isActive: v.is_active,
      unavailableReason: v.unavailable_reason,
      // 造形上限超過のサイズは STEP1 で is_active=false・理由付きで作られている
      selectable: v.is_active || v.unavailable_reason == null,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-ink">作品情報とサイズ展開</h1>
        <StepNav current={3} productId={product.id} />
      </div>

      {variants.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          サイズ展開がまだありません。STEP1 で3Dデータの検証を通してください。
        </p>
      ) : (
        <ProductInfoForm
          productId={product.id}
          initial={{
            title: product.title,
            description: product.description,
            categoryId: product.category_id,
            tagIds: product.product_tags.map((t) => t.tag_id),
            filamentIds: product.product_filaments.map((f) => f.filament_id),
            defaultFilamentId:
              product.product_filaments.find((f) => f.is_default)?.filament_id ?? null,
            printNote: product.print_note ?? "",
            variants,
          }}
          categories={categories}
          tags={tags}
          filaments={filaments}
          commissionRate={Number(creatorProfile?.commission_rate ?? 0.3)}
        />
      )}
    </div>
  );
}

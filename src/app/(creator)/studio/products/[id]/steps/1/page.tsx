import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import { getProductDraft } from "@/features/products/queries";
import { listNuiSizes } from "@/features/nuis/queries";
import type { MeshAnalysis, MeshCheck } from "@/features/products/mesh-validation";
import { Step1Uploader, type SizePreview } from "@/components/product/step1-uploader";
import { StepNav } from "@/components/product/step-nav";

export const metadata = { title: "作品を投稿（STEP1 3Dデータ）" };

export default async function Step1Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const [product, nuiSizes] = await Promise.all([
    getProductDraft(id, user.id),
    listNuiSizes(),
  ]);
  if (!product) notFound();

  // 最後にアップロードされたパーツの検証結果を見せる
  const latest = [...product.product_asset_validations].at(-1) ?? null;
  const analysis: MeshAnalysis | null = latest
    ? {
        passed: latest.passed,
        checks: (latest.checks ?? []) as unknown as MeshCheck[],
        triangleCount: latest.triangle_count ?? 0,
        bbox:
          latest.bbox_w_mm != null
            ? {
                w: Number(latest.bbox_w_mm),
                d: Number(latest.bbox_d_mm),
                h: Number(latest.bbox_h_mm),
              }
            : null,
        shellCount: latest.shell_count,
        volumeCm3: null,
      }
    : null;

  // 並び順は nui_sizes マスタの sort_order（10cm → 15cm → 20cm → その他）に従う
  const sizeOrder = (id: number) => {
    const i = nuiSizes.findIndex((s) => s.id === id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sizePreview: SizePreview[] = [...product.product_size_variants]
    .sort((a, b) => sizeOrder(a.nui_size_id) - sizeOrder(b.nui_size_id))
    .map((v) => ({
      label: nuiSizes.find((s) => s.id === v.nui_size_id)?.label ?? `${v.nui_size_id}`,
      price: v.price,
      agencyFee: v.agency_fee,
      estPrintMin: v.est_print_min,
      isActive: v.is_active,
      unavailableReason: v.unavailable_reason,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-ink">{product.title}</h1>
        <StepNav current={1} productId={product.id} />
      </div>
      <Step1Uploader
        productId={product.id}
        initialAnalysis={analysis}
        sizePreview={sizePreview}
      />
    </div>
  );
}

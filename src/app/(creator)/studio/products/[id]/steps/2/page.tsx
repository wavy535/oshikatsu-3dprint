import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import { getProductDraft, listFilaments } from "@/features/products/queries";
import { StepNav } from "@/components/product/step-nav";
import { PrintInstructionsForm, type PartRow } from "./print-instructions-form";

export const metadata = { title: "作品を投稿（STEP2 印刷指示）" };

export default async function Step2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const [product, filaments] = await Promise.all([
    getProductDraft(id, user.id),
    listFilaments(),
  ]);
  if (!product) notFound();

  const parts: PartRow[] = [...product.product_assets]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => ({
      assetId: a.id,
      originalName: a.original_name,
      partLabel: a.part_label ?? "",
      quantityPerItem: a.quantity_per_item,
      layerDirection: (a.layer_direction ?? "auto") as PartRow["layerDirection"],
      supportType: (a.support_type ?? "auto") as PartRow["supportType"],
      colorSlot: a.color_slot,
      filamentId: a.filament_id,
      printNote: a.print_note ?? "",
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-ink">{product.title}</h1>
        <StepNav current={2} productId={product.id} />
        <p className="text-[11.5px] leading-5 text-muted-foreground">
          パーツごとに積層方向とサポートを指示します。ここで入れた指示が、
          そのまま運営の印刷ジョブ詳細に届きます。
        </p>
      </div>
      <PrintInstructionsForm
        productId={product.id}
        initialParts={parts}
        filaments={filaments}
      />
    </div>
  );
}

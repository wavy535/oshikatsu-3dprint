import { estimateVariant, type PricingRule, type VariantEstimate } from "@/lib/print/estimate";

type PrintAsset = {
  file_name: string;
  total_volume_cm3: number | string | null;
  total_surface_area_cm2: number | string | null;
  objects: { name: string; bbox_x_mm: number | string; bbox_y_mm: number | string; bbox_z_mm: number | string }[];
};

/** All print files form one product; charge handling once and count every part. */
export function combinedEstimates(assets: PrintAsset[], sizes: Pick<VariantEstimate, "sizeLabel" | "nuiSizeCm" | "scaleRatio">[], rule: PricingRule) {
  const parts = assets.flatMap((asset) => asset.objects.map((part) => ({
    name: `${asset.file_name} / ${part.name}`,
    bboxMm: [Number(part.bbox_x_mm), Number(part.bbox_y_mm), Number(part.bbox_z_mm)] as [number, number, number],
  })));
  const base = {
    parts,
    partCount: parts.length,
    bboxMm: [0, 1, 2].map((axis) => Math.max(0, ...parts.map((part) => part.bboxMm[axis]))) as [number, number, number],
    volumeCm3: assets.reduce((sum, asset) => sum + Number(asset.total_volume_cm3 ?? 0), 0),
    surfaceAreaCm2: assets.reduce((sum, asset) => sum + Number(asset.total_surface_area_cm2 ?? 0), 0),
  };
  return sizes.map((size) => estimateVariant(base, size.sizeLabel, size.nuiSizeCm, size.scaleRatio, rule));
}

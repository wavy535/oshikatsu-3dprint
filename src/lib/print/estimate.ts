// 見積り計算。数値は print_pricing_rules の既定値に合わせてある。
// スライサーを回さずに材料量と造形時間を出すための近似で、
// 実績（print_jobs.actual_*）と突き合わせて係数を見直せるようにパラメータで持つ。

export type EstimateParams = {
  shellThicknessCm: number;   // 外殻の実効厚み（外壁3周 + 天面/底面）
  infillRatio: number;        // 充填率
  densityGPerCm3: number;     // フィラメント密度（PLA 1.24）
  flowMm3PerSec: number;      // 実効吐出量（0.4ノズル / 0.2積層）
  overhead: number;           // 移動・加減速・リトラクトの割増
};

export const DEFAULT_ESTIMATE: EstimateParams = {
  shellThicknessCm: 0.09,
  infillRatio: 0.15,
  densityGPerCm3: 1.24,
  flowMm3PerSec: 3.6,
  overhead: 1.45,
};

export type PricingRule = {
  materialYenPerGram: number;
  machineYenPerHour: number;
  handlingBaseYen: number;
  handlingPerPartYen: number;
  platformFeeRate: number;
  bedXMm: number;
  bedYMm: number;
  bedZMm: number;
  maxBatchHours: number;
};

export const DEFAULT_PRICING: PricingRule = {
  materialYenPerGram: 3.5,
  machineYenPerHour: 75,
  handlingBaseYen: 0,
  handlingPerPartYen: 20,
  platformFeeRate: 0.2,
  bedXMm: 220,
  bedYMm: 220,
  bedZMm: 250,
  maxBatchHours: 24,
};

// 外殻を先に埋め、残りを充填率で満たす近似
export function estimateFilamentGrams(
  surfaceAreaCm2: number,
  volumeCm3: number,
  p: EstimateParams = DEFAULT_ESTIMATE
): number {
  const shell = Math.min(surfaceAreaCm2 * p.shellThicknessCm, volumeCm3);
  const rest = Math.max(volumeCm3 - shell, 0) * p.infillRatio;
  return Math.round((shell + rest) * p.densityGPerCm3 * 10) / 10;
}

export function estimatePrintHours(
  grams: number,
  p: EstimateParams = DEFAULT_ESTIMATE
): number {
  const extrudedMm3 = (grams / p.densityGPerCm3) * 1000;
  const seconds = (extrudedMm3 / p.flowMm3PerSec) * p.overhead;
  return Math.round((seconds / 3600) * 100) / 100;
}

// DB 側の calc_print_fee() と1円まで一致させる必要がある。
// あちらは項ごとに round しているので、こちらも同じ順序で丸める。
// （合計してから丸めると ¥1 ずれ、画面の表示とDBの値が食い違う）
export function calcPrintFeeJpy(
  grams: number,
  hours: number,
  partCount: number,
  r: PricingRule = DEFAULT_PRICING
): number {
  return (
    Math.round(grams * r.materialYenPerGram) +
    Math.round(hours * r.machineYenPerHour) +
    r.handlingBaseYen +
    r.handlingPerPartYen * Math.max(partCount, 1)
  );
}

export type BedFit = {
  fits: boolean;
  reason: string | null;
};

// XY は入れ替えて置けるので、長辺同士・短辺同士で比べる
export function fitsOnBed(
  bbox: [number, number, number],
  r: PricingRule = DEFAULT_PRICING
): BedFit {
  const [x, y, z] = bbox;
  const longSide = Math.max(x, y);
  const shortSide = Math.min(x, y);
  const bedLong = Math.max(r.bedXMm, r.bedYMm);
  const bedShort = Math.min(r.bedXMm, r.bedYMm);

  if (longSide > bedLong || shortSide > bedShort || z > r.bedZMm) {
    return {
      fits: false,
      reason: `造形サイズ ${x.toFixed(1)}×${y.toFixed(1)}×${z.toFixed(1)} mm がベッド上限 ${r.bedXMm}×${r.bedYMm}×${r.bedZMm} mm を超過`,
    };
  }
  return { fits: true, reason: null };
}

// パーツは1つずつ（またはまとめて）刷るので、ベッドに載るかは
// 組み立て後の大きさではなく「一番大きいパーツ単体」で決まる。
export function fitsOnBedParts(
  parts: { name: string; bboxMm: [number, number, number] }[],
  r: PricingRule = DEFAULT_PRICING
): BedFit & { oversizedParts: string[] } {
  const oversized = parts.filter((p) => !fitsOnBed(p.bboxMm, r).fits);
  if (oversized.length === 0) return { fits: true, reason: null, oversizedParts: [] };
  const first = oversized[0];
  const [x, y, z] = first.bboxMm;
  return {
    fits: false,
    reason:
      `パーツ「${first.name}」が ${x.toFixed(1)}×${y.toFixed(1)}×${z.toFixed(1)} mm で ` +
      `ベッド上限 ${r.bedXMm}×${r.bedYMm}×${r.bedZMm} mm を超過` +
      (oversized.length > 1 ? `（ほか ${oversized.length - 1} パーツ）` : ""),
    oversizedParts: oversized.map((p) => p.name),
  };
}

export function batchCount(hours: number, r: PricingRule = DEFAULT_PRICING): number {
  return Math.max(1, Math.ceil(hours / r.maxBatchHours));
}

// ---------------------------------------------------------------------------
// サイズ展開：体積は3乗、表面積は2乗で効く
// ---------------------------------------------------------------------------
export type VariantEstimate = {
  sizeLabel: string;
  nuiSizeCm: number;
  scaleRatio: number;
  bboxMm: [number, number, number];
  volumeCm3: number;
  surfaceAreaCm2: number;
  grams: number;
  hours: number;
  partCount: number;
  batchCount: number;
  printFeeJpy: number;
  isPrintable: boolean;
  unprintableReason: string | null;
  // ベッド判定に使った「一番大きいパーツ」の寸法（このサイズにスケール済み）
  maxPartBboxMm: [number, number, number];
  oversizedParts: string[];
};

export function estimateVariant(
  base: {
    // 組み立て後のおおよその大きさ（表示用）
    bboxMm: [number, number, number];
    volumeCm3: number;
    surfaceAreaCm2: number;
    partCount: number;
    // ベッド判定はパーツ単体で行う
    parts: { name: string; bboxMm: [number, number, number] }[];
  },
  sizeLabel: string,
  nuiSizeCm: number,
  scaleRatio: number,
  rule: PricingRule = DEFAULT_PRICING,
  params: EstimateParams = DEFAULT_ESTIMATE
): VariantEstimate {
  const s = scaleRatio;
  const bboxMm: [number, number, number] = [
    base.bboxMm[0] * s,
    base.bboxMm[1] * s,
    base.bboxMm[2] * s,
  ];
  const volumeCm3 = base.volumeCm3 * s ** 3;
  const surfaceAreaCm2 = base.surfaceAreaCm2 * s ** 2;
  const grams = estimateFilamentGrams(surfaceAreaCm2, volumeCm3, params);
  const hours = estimatePrintHours(grams, params);
  const scaledParts = base.parts.map((p) => ({
    name: p.name,
    bboxMm: [p.bboxMm[0] * s, p.bboxMm[1] * s, p.bboxMm[2] * s] as [number, number, number],
  }));
  const fit = fitsOnBedParts(scaledParts, rule);
  const largest = scaledParts.reduce(
    (acc, p) =>
      p.bboxMm[0] * p.bboxMm[1] * p.bboxMm[2] > acc.bboxMm[0] * acc.bboxMm[1] * acc.bboxMm[2] ? p : acc,
    scaledParts[0] ?? { name: "", bboxMm: [0, 0, 0] as [number, number, number] }
  );

  return {
    sizeLabel,
    nuiSizeCm,
    scaleRatio: s,
    bboxMm,
    volumeCm3: Math.round(volumeCm3 * 100) / 100,
    surfaceAreaCm2: Math.round(surfaceAreaCm2 * 100) / 100,
    grams,
    hours,
    partCount: base.partCount,
    batchCount: batchCount(hours, rule),
    printFeeJpy: calcPrintFeeJpy(grams, hours, base.partCount, rule),
    isPrintable: fit.fits,
    unprintableReason: fit.reason,
    maxPartBboxMm: largest.bboxMm,
    oversizedParts: fit.oversizedParts,
  };
}

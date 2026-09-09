import { AnalysisBudget } from "./limits.ts";
import { analyzeMesh, type MeshAnalysis } from "./analyze.ts";
import {
  DEFAULT_PRICING,
  estimateFilamentGrams,
  estimatePrintHours,
  estimateVariant,
  fitsOnBedParts,
  type PricingRule,
  type VariantEstimate,
} from "./estimate.ts";
import { boundsSize, mergeBounds, type Mesh } from "./mesh.ts";
import { parseStl } from "./stl.ts";
import { parseThreeMf, type ThreeMfMaterial } from "./threemf.ts";

export * from "./estimate.ts";
export type { MeshAnalysis } from "./analyze.ts";

export type IssueSeverity = "ok" | "warning" | "error";

// work_validation_issues に1行ずつ入る形。
// STEP1 のチェックリストは「OKの項目も出す」ので、問題がなくても severity=ok で1件返す。
export type ValidationIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  detail: Record<string, unknown>;
  objectIndex?: number;
};

export type AnalyzedObject = {
  objectIndex: number;
  name: string;
  triangleCount: number;
  bboxMm: [number, number, number];
  volumeCm3: number;
  surfaceAreaCm2: number;
  isManifold: boolean;
  openEdgeCount: number;
  flippedNormalCount: number;
  selfIntersectionCount: number;
  minWallThicknessMm: number | null;
  analysis: MeshAnalysis;
};

export type AnalyzedColorSlot = {
  slotIndex: number;
  sourceName: string;
  sourceHex: string;
  faceCount: number;
};

export type AssetAnalysis = {
  format: "3mf" | "stl";
  unit: "mm";
  unitDeclared: boolean;
  declaredUnit: string | null;
  objectCount: number;
  triangleCount: number;
  vertexCount: number;
  totalVolumeCm3: number;
  totalSurfaceAreaCm2: number;
  // プレート上の並べ方に依存しない「組み立て後のおおよその大きさ」。
  // 3MF の build item はエクスポータがパーツを平面に並べて出すので、
  // そのままの外接直方体を作品サイズとして使うと横に長い箱になってしまう。
  assembledBboxMm: [number, number, number];
  // 実際にプレートに載っている状態の外接直方体（参考値）
  plateBboxMm: [number, number, number];
  // 一番大きいパーツ単体の寸法。ベッドに載るかはこれで決まる
  maxPartBboxMm: [number, number, number];
  objects: AnalyzedObject[];
  colorSlots: AnalyzedColorSlot[];
  issues: ValidationIssue[];
  status: "passed" | "warning" | "failed";
  baseEstimate: {
    grams: number;
    hours: number;
    partCount: number;
  };
  variants: VariantEstimate[];
};

export type AnalyzeOptions = {
  fileName: string;
  rule?: PricingRule;
  // サイズ展開の定義。基準サイズの scaleRatio は 1
  sizes?: { label: string; nuiSizeCm: number; scaleRatio: number }[];
  minWallThicknessMm?: number;
  thicknessSamples?: number;
  selfIntersectionSamples?: number;
};

const DEFAULT_SIZES = [
  { label: "10cm", nuiSizeCm: 10, scaleRatio: 2 / 3 },
  { label: "15cm", nuiSizeCm: 15, scaleRatio: 1 },
  { label: "20cm", nuiSizeCm: 20, scaleRatio: 4 / 3 },
];

export class UnsupportedFormatError extends Error {}

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i + 1).toLowerCase();
}

export function analyzeModelFile(buf: Buffer, opts: AnalyzeOptions): AssetAnalysis {
  const budget = new AnalysisBudget();
  const rule = opts.rule ?? DEFAULT_PRICING;
  const sizes = opts.sizes ?? DEFAULT_SIZES;
  const minWall = opts.minWallThicknessMm ?? 0.8;
  const ext = extensionOf(opts.fileName);

  let doc:
    | { format: "3mf"; unitDeclared: boolean; declaredUnit: string | null; objects: { name: string; mesh: Mesh }[]; materials: ThreeMfMaterial[] }
    | { format: "stl"; unitDeclared: boolean; declaredUnit: null; objects: { name: string; mesh: Mesh }[]; materials: [] };

  if (ext === "3mf") {
    const parsed = parseThreeMf(buf, budget);
    doc = {
      format: "3mf",
      unitDeclared: parsed.unitDeclared,
      declaredUnit: parsed.declaredUnit,
      objects: parsed.objects,
      materials: parsed.materials,
    };
  } else if (ext === "stl") {
    const parsed = parseStl(buf, opts.fileName.replace(/\.[^.]+$/, ""));
    doc = {
      format: "stl",
      unitDeclared: false,
      declaredUnit: null,
      objects: parsed.objects,
      materials: [],
    };
  } else {
    throw new UnsupportedFormatError(
      `対応していない拡張子です（.${ext}）。.3mf または .stl をアップロードしてください`
    );
  }

  // --- オブジェクトごとの解析 -------------------------------------------------
  const objects: AnalyzedObject[] = [];
  let bounds = null as ReturnType<typeof mergeBounds> | null;
  let triangleCount = 0;
  let vertexCount = 0;
  let totalVolumeMm3 = 0;
  let totalAreaMm2 = 0;

  doc.objects.forEach((o, i) => {
    const a = analyzeMesh(o.mesh, {
      thicknessSamples: opts.thicknessSamples,
      selfIntersectionSamples: opts.selfIntersectionSamples,
    }, budget);
    const size = boundsSize(a.geometry.bounds);

    objects.push({
      objectIndex: i,
      name: o.name,
      triangleCount: a.triangleCount,
      bboxMm: [size[0], size[1], size[2]],
      volumeCm3: a.geometry.volumeMm3 / 1000,
      surfaceAreaCm2: a.geometry.surfaceAreaMm2 / 100,
      isManifold: a.topology.isManifold,
      openEdgeCount: a.topology.openEdgeCount,
      flippedNormalCount: a.topology.flippedNormalCount,
      selfIntersectionCount: a.selfIntersection.count,
      minWallThicknessMm: a.thickness.minWallThicknessMm,
      analysis: a,
    });

    bounds = bounds ? mergeBounds(bounds, a.geometry.bounds) : a.geometry.bounds;
    triangleCount += a.triangleCount;
    vertexCount += a.topology.weldedVertexCount;
    totalVolumeMm3 += a.geometry.volumeMm3;
    totalAreaMm2 += a.geometry.surfaceAreaMm2;
  });

  const overall = bounds ? boundsSize(bounds) : [0, 0, 0];
  const plateBboxMm: [number, number, number] = [overall[0], overall[1], overall[2]];
  // 各パーツの寸法の最大値を取ることで、並べ方に左右されない大きさの上限を出す
  const assembledBboxMm: [number, number, number] = [
    Math.max(0, ...objects.map((o) => o.bboxMm[0])),
    Math.max(0, ...objects.map((o) => o.bboxMm[1])),
    Math.max(0, ...objects.map((o) => o.bboxMm[2])),
  ];
  const partList = objects.map((o) => ({ name: o.name, bboxMm: o.bboxMm }));
  const largestPart = partList.reduce(
    (acc, p) => (p.bboxMm[0] * p.bboxMm[1] * p.bboxMm[2] > acc.bboxMm[0] * acc.bboxMm[1] * acc.bboxMm[2] ? p : acc),
    partList[0] ?? { name: "", bboxMm: [0, 0, 0] as [number, number, number] }
  );
  const bboxMm = assembledBboxMm;
  const totalVolumeCm3 = totalVolumeMm3 / 1000;
  const totalSurfaceAreaCm2 = totalAreaMm2 / 100;
  const partCount = objects.length;

  const colorSlots: AnalyzedColorSlot[] = doc.materials.map((m, i) => ({
    slotIndex: i + 1,
    sourceName: m.name,
    sourceHex: m.hex,
    faceCount: m.faceCount,
  }));

  // --- 検証ルール -------------------------------------------------------------
  const issues: ValidationIssue[] = [];
  const push = (i: ValidationIssue) => issues.push(i);

  // 1. マニフォールド
  const openEdges = objects.reduce((s, o) => s + o.openEdgeCount, 0);
  const nonManifold = objects.reduce((s, o) => s + o.analysis.topology.nonManifoldEdgeCount, 0);
  if (openEdges === 0 && nonManifold === 0) {
    push({
      code: "manifold",
      severity: "ok",
      message: `全${partCount}オブジェクト 開エッジ 0`,
      detail: { openEdges: 0, nonManifoldEdges: 0, objectCount: partCount },
    });
  } else {
    push({
      code: "manifold",
      severity: "error",
      message: `開放エッジ ${openEdges}${nonManifold > 0 ? ` ・ 非多様体エッジ ${nonManifold}` : ""}`,
      detail: {
        openEdges,
        nonManifoldEdges: nonManifold,
        fix: "Blender の「非多様体を選択」で穴を張るか、Meshmixer の Inspector で自動修復してください",
      },
    });
  }

  // 2. 法線の向き
  const flipped = objects.reduce((s, o) => s + o.flippedNormalCount, 0);
  const inverted = objects.filter((o) => o.analysis.geometry.signedVolumeMm3 < 0);
  if (flipped === 0 && inverted.length === 0) {
    push({ code: "normals", severity: "ok", message: "0 面", detail: { flipped: 0 } });
  } else {
    push({
      code: "normals",
      severity: "error",
      message:
        inverted.length > 0
          ? `${inverted.length}オブジェクトの法線が全体的に内向きです`
          : `巻き順が揃っていない面 ${flipped}`,
      detail: {
        flipped,
        invertedObjects: inverted.map((o) => o.name),
        fix: "Blender で全選択 → Shift+N（法線を外側に再計算）",
      },
    });
  }

  // 3. 単位・スケール
  const maxDim = Math.max(bboxMm[0], bboxMm[1], bboxMm[2]);
  if (doc.format === "3mf" && doc.unitDeclared) {
    push({
      code: "unit_scale",
      severity: "ok",
      message: `mm（実寸）・3MF の unit 属性と一致`,
      detail: { declaredUnit: doc.declaredUnit, maxDimMm: round(maxDim, 1) },
    });
  } else if (maxDim < 5) {
    push({
      code: "unit_scale",
      severity: "error",
      message: `最大寸法が ${round(maxDim, 2)} mm しかありません（メートル単位で書き出された可能性）`,
      detail: { maxDimMm: round(maxDim, 2), fix: "mm 単位で書き出し直してください" },
    });
  } else if (maxDim > 1000) {
    push({
      code: "unit_scale",
      severity: "warning",
      message: `最大寸法 ${round(maxDim, 1)} mm。実寸として大きすぎないか確認してください`,
      detail: { maxDimMm: round(maxDim, 1) },
    });
  } else {
    push({
      code: "unit_scale",
      severity: "warning",
      message: "単位情報がありません → mm と解釈しました",
      detail: {
        maxDimMm: round(maxDim, 1),
        fix: ".3mf で書き出すと単位が保持されます",
      },
    });
  }

  // 4. 最小肉厚
  //   三角形1枚のスライバーで弾くと誤検知だらけになるので、
  //   「薄い面が表面積のどれくらいを占めるか」で重大度を分ける。
  const thicknesses = objects
    .map((o) => o.minWallThicknessMm)
    .filter((v): v is number => v !== null);
  const minThickness = thicknesses.length > 0 ? Math.min(...thicknesses) : null;
  const thinObjects = objects
    .filter((o) => o.analysis.thickness.thinAreaRatio > 0)
    .sort((a, b) => b.analysis.thickness.thinAreaRatio - a.analysis.thickness.thinAreaRatio);
  const worstRatio = thinObjects[0]?.analysis.thickness.thinAreaRatio ?? 0;
  const SIGNIFICANT_THIN_RATIO = 0.02; // 表面積の2%以上が薄いならエラー

  if (minThickness === null) {
    push({
      code: "min_thickness",
      severity: "warning",
      message: "肉厚を測定できませんでした（閉じた形状ではない可能性）",
      detail: {},
    });
  } else if (worstRatio === 0) {
    push({
      code: "min_thickness",
      severity: "ok",
      message: `最小 ${round(minThickness, 2)} mm`,
      detail: { minWallThicknessMm: round(minThickness, 2), thresholdMm: minWall },
    });
  } else {
    const worst = thinObjects[0];
    const significant = worstRatio >= SIGNIFICANT_THIN_RATIO;
    push({
      code: "min_thickness",
      severity: significant ? "error" : "warning",
      message:
        `${round(worst.minWallThicknessMm ?? minThickness, 2)} mm` +
        `（${minWall} mm 未満が「${worst.name}」の表面積の ${round(worstRatio * 100, 1)}%）`,
      detail: {
        minWallThicknessMm: round(minThickness, 2),
        thresholdMm: minWall,
        worstObject: worst.name,
        thinAreaRatio: round(worstRatio, 4),
        perObject: thinObjects.slice(0, 5).map((o) => ({
          name: o.name,
          minMm: o.minWallThicknessMm === null ? null : round(o.minWallThicknessMm, 2),
          thinAreaRatio: round(o.analysis.thickness.thinAreaRatio, 4),
        })),
        fix: significant
          ? `${minWall} mm 以上に厚みを付けてください。薄すぎる箇所は印刷で消えます`
          : `薄い箇所はごく一部です。細部が欠けても問題なければこのまま進めます`,
      },
    });
  }

  // 5. 自己交差
  const selfInt = objects.reduce((s, o) => s + o.selfIntersectionCount, 0);
  push(
    selfInt === 0
      ? { code: "self_intersection", severity: "ok", message: "なし", detail: { count: 0 } }
      : {
          code: "self_intersection",
          severity: "warning",
          message: `面の重なり ${selfInt} 箇所（サンプル検査）`,
          detail: {
            count: selfInt,
            note: "多くのスライサーはスライス時に和を取るため印刷は通りますが、断面が意図しない形になることがあります",
            fix: "重なったパーツをブーリアン和で結合しておくと確実です",
          },
        }
  );

  // 6. 造形サイズ（パーツ単体でベッドに載るか）
  const baseFit = fitsOnBedParts(partList, rule);
  push(
    baseFit.fits
      ? {
          code: "build_size",
          severity: "ok",
          message:
            `最大パーツ ${round(largestPart.bboxMm[0], 1)} × ${round(largestPart.bboxMm[1], 1)} mm` +
            `（ベッド ${rule.bedXMm}角に対し余裕 ${round(Math.min(rule.bedXMm - Math.max(largestPart.bboxMm[0], largestPart.bboxMm[1]), rule.bedYMm - Math.min(largestPart.bboxMm[0], largestPart.bboxMm[1])), 0)}mm）`,
          detail: {
            largestPart: largestPart.name,
            partBboxMm: largestPart.bboxMm.map((v) => round(v, 1)),
            assembledBboxMm: assembledBboxMm.map((v) => round(v, 1)),
          },
        }
      : {
          code: "build_size",
          severity: "warning",
          message: baseFit.reason ?? "ベッドサイズを超過",
          detail: {
            oversizedParts: baseFit.oversizedParts,
            bed: [rule.bedXMm, rule.bedYMm, rule.bedZMm],
          },
        }
  );

  // 7. 色情報
  if (doc.format === "stl") {
    push({
      code: "color_info",
      severity: "warning",
      message: "STL は色情報を持ちません → 単色のみの出品になります",
      detail: { fix: ".3mf で書き出すと色とパーツ分割を保持できます" },
    });
  } else if (colorSlots.length === 0) {
    push({
      code: "color_info",
      severity: "warning",
      message: "色定義が見つかりませんでした → 単色として扱います",
      detail: {},
    });
  } else {
    push({
      code: "color_info",
      severity: "ok",
      message: `${colorSlots.length}色（${colorSlots.map((c) => `${c.sourceName} ${c.sourceHex}`).join(" / ")}）を検出 → STEP2で割り当て`,
      detail: { slots: colorSlots },
    });
  }

  // --- 見積り -----------------------------------------------------------------
  const grams = estimateFilamentGrams(totalSurfaceAreaCm2, totalVolumeCm3);
  const hours = estimatePrintHours(grams);

  const variants = sizes.map((s) =>
    estimateVariant(
      {
        bboxMm: assembledBboxMm,
        volumeCm3: totalVolumeCm3,
        surfaceAreaCm2: totalSurfaceAreaCm2,
        partCount,
        parts: partList,
      },
      s.label,
      s.nuiSizeCm,
      s.scaleRatio,
      rule
    )
  );

  // 8. 造形回数（サイズ展開の合計から）
  const baseVariant = variants.find((v) => v.scaleRatio === 1) ?? variants[0];
  if (baseVariant) {
    push({
      code: "batch_count",
      severity: baseVariant.batchCount > 1 ? "warning" : "ok",
      message:
        baseVariant.batchCount > 1
          ? `合計 ${baseVariant.hours} 時間 ・ ${rule.bedXMm}角ベッドでは ${baseVariant.batchCount} バッチに分割が必要`
          : `合計 ${baseVariant.hours} 時間 ・ 1バッチで造形可能`,
      detail: { hours: baseVariant.hours, batchCount: baseVariant.batchCount },
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");

  return {
    format: doc.format,
    unit: "mm",
    unitDeclared: doc.unitDeclared,
    declaredUnit: doc.declaredUnit,
    objectCount: partCount,
    triangleCount,
    vertexCount,
    totalVolumeCm3: round(totalVolumeCm3, 2),
    totalSurfaceAreaCm2: round(totalSurfaceAreaCm2, 2),
    assembledBboxMm: [round(assembledBboxMm[0], 2), round(assembledBboxMm[1], 2), round(assembledBboxMm[2], 2)],
    plateBboxMm: [round(plateBboxMm[0], 2), round(plateBboxMm[1], 2), round(plateBboxMm[2], 2)],
    maxPartBboxMm: [round(largestPart.bboxMm[0], 2), round(largestPart.bboxMm[1], 2), round(largestPart.bboxMm[2], 2)],
    objects,
    colorSlots,
    issues,
    status: hasError ? "failed" : hasWarning ? "warning" : "passed",
    baseEstimate: { grams, hours, partCount },
    variants,
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

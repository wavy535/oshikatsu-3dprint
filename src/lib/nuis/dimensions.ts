import { NUI_PROPORTIONS } from "./config.ts";

/** マイぬいの採寸値（mm）。身長だけが必須で、ほかは入力されたときだけ値を持つ */
export type NuiMeasurements = {
  heightMm: number;
  sitHeightMm: number | null;
  shoulderWidthMm: number | null;
  hugWidthMm: number | null;
};

const TENTHS_PER_MM = 10;
const PERCENT = 100;

// 身長 × 比率を mm の小数第1位で四捨五入する。DB の round(height_mm * ratio, 1)（numeric）と同じ結果にするため、
// 浮動小数点の誤差が出ないよう 0.1mm と百分率の整数で計算する
function estimateMm(heightMm: number, ratio: number) {
  const heightTenths = Math.round(heightMm * TENTHS_PER_MM);
  const ratioPercent = Math.round(ratio * PERCENT);
  // 0.1mm 単位の推定値 = heightTenths × ratioPercent ÷ 100。整数どうしで四捨五入する
  return Math.floor((heightTenths * ratioPercent + PERCENT / 2) / PERCENT) / TENTHS_PER_MM;
}

/**
 * 相性判定・AR で使う大きさ。入力されていればその値、なければ身長からの推定値。
 * 幅は抱き幅、なければ肩幅（相性判定と同じく、奥行きにも使う）。DB の nui_sit_height_mm() / nui_width_mm() と同じ計算。
 */
export function effectiveNuiSize(nui: NuiMeasurements) {
  return {
    sitHeightMm: nui.sitHeightMm ?? estimateMm(nui.heightMm, NUI_PROPORTIONS.sitHeightPerHeight),
    widthMm: nui.hugWidthMm ?? nui.shoulderWidthMm ?? estimateMm(nui.heightMm, NUI_PROPORTIONS.widthPerHeight),
  };
}

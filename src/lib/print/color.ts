// sRGB（3MF の displaycolor や "#RRGGBB"）と、リニア RGB（Blender・glTF）の行き来。
// 変換式は sRGB の規格どおりで、調整する値ではない。

const SRGB_ENCODE_THRESHOLD = 0.0031308;
const SRGB_DECODE_THRESHOLD = 0.04045;
const SRGB_SLOPE = 12.92;
const SRGB_SCALE = 1.055;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;
const BYTE_MAX = 255;
const HEX_BASE = 16;
const HEX_PER_CHANNEL = 2;
const RGB_CHANNELS = 3;
const HEX_PATTERN = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** リニア RGB（0〜1）を sRGB の "#RRGGBB" にする */
export function linearToSrgbHex(rgb: readonly number[]): string {
  const channels = Array.from({ length: RGB_CHANNELS }, (_, k) => {
    const linear = clamp01(rgb[k] ?? 0);
    const srgb =
      linear <= SRGB_ENCODE_THRESHOLD ? linear * SRGB_SLOPE : SRGB_SCALE * linear ** (1 / SRGB_GAMMA) - SRGB_OFFSET;
    return Math.round(clamp01(srgb) * BYTE_MAX)
      .toString(HEX_BASE)
      .padStart(HEX_PER_CHANNEL, "0")
      .toUpperCase();
  });
  return `#${channels.join("")}`;
}

/** sRGB の "#RRGGBB"（"#RRGGBBAA" も可）をリニア RGB（0〜1、3要素）にする。読めなければ null */
export function srgbHexToLinear(hex: string): [number, number, number] | null {
  if (!HEX_PATTERN.test(hex)) return null;
  const digits = hex.startsWith("#") ? hex.slice(1) : hex;
  const channels = Array.from({ length: RGB_CHANNELS }, (_, k) => {
    const srgb = parseInt(digits.slice(k * HEX_PER_CHANNEL, (k + 1) * HEX_PER_CHANNEL), HEX_BASE) / BYTE_MAX;
    return srgb <= SRGB_DECODE_THRESHOLD
      ? srgb / SRGB_SLOPE
      : ((srgb + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  });
  return [channels[0], channels[1], channels[2]];
}

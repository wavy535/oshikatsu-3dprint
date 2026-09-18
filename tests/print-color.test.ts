import { expect, test } from "vitest";
import { linearToSrgbHex, srgbHexToLinear } from "@/lib/print/color";

test("linear colors (Blender, glTF) and sRGB hex (3MF) convert both ways", () => {
  expect(linearToSrgbHex([0, 0, 0])).toBe("#000000");
  expect(linearToSrgbHex([1, 1, 1])).toBe("#FFFFFF");
  // 実ファイルのマテリアル（Wood_Top と Trim_Black の基本色）
  expect(linearToSrgbHex([0.7, 0.545, 0.35])).toBe("#DAC3A0");
  expect(linearToSrgbHex([0.055, 0.052, 0.06])).toBe("#424045");
  // 暗い側は直線、明るい側はガンマ
  expect(linearToSrgbHex([0.001, 0.5, 0.5])).toBe("#03BCBC");

  for (const hex of ["#000000", "#FFFFFF", "#DAC3A0", "#424045", "#E7E7E7"]) {
    expect(linearToSrgbHex(srgbHexToLinear(hex)!)).toBe(hex);
  }
  // 不透明度は落とす（形しか出さないため）
  expect(srgbHexToLinear("#FFFFFF80")).toEqual([1, 1, 1]);
  expect(srgbHexToLinear("FFFFFF")).toEqual([1, 1, 1]);
});

test("colors outside the range are clamped, and unreadable hex is rejected", () => {
  expect(linearToSrgbHex([-1, 2, Number.NaN])).toBe("#00FF00");
  expect(linearToSrgbHex([])).toBe("#000000");
  for (const invalid of ["#FFF", "#GGGGGG", "白", "", "#FFFFFFF"]) {
    expect(srgbHexToLinear(invalid)).toBeNull();
  }
});

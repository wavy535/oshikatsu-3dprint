import { expect, test } from "vitest";
import { NUI_PROPORTIONS } from "@/lib/nuis/config";
import { effectiveNuiSize } from "@/lib/nuis/dimensions";

const heightOnly = { heightMm: 150, sitHeightMm: null, shoulderWidthMm: null, hugWidthMm: null };

test("values that were not entered are estimated from the height", () => {
  expect(NUI_PROPORTIONS).toEqual({ sitHeightPerHeight: 0.88, widthPerHeight: 0.57 });
  // 150 × 0.88 = 132, 150 × 0.57 = 85.5 (exact decimals, not 85.49999… from floating point)
  expect(effectiveNuiSize(heightOnly)).toEqual({ sitHeightMm: 132, widthMm: 85.5 });
});

test("entered values win over estimates, and the hug width wins over the shoulder width", () => {
  expect(effectiveNuiSize({ ...heightOnly, sitHeightMm: 140, shoulderWidthMm: 70 })).toEqual({
    sitHeightMm: 140,
    widthMm: 70,
  });
  expect(effectiveNuiSize({ ...heightOnly, shoulderWidthMm: 70, hugWidthMm: 90 }).widthMm).toBe(90);
});

test("estimates round half up to 0.1 mm like PostgreSQL numeric round(x, 1)", () => {
  // 145 × 0.57 = 82.65 exactly; binary floating point gives 82.64999… and would round down.
  expect(effectiveNuiSize({ ...heightOnly, heightMm: 145 }).widthMm).toBe(82.7);
  expect(effectiveNuiSize({ ...heightOnly, heightMm: 155 }).widthMm).toBe(88.4);
  expect(effectiveNuiSize({ ...heightOnly, heightMm: 152.3 })).toEqual({ sitHeightMm: 134, widthMm: 86.8 });
});

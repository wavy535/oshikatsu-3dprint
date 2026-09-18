import { expect, test } from "vitest";
import { combinedEstimates } from "@/lib/works/combined-estimates";
import { DEFAULT_PRICING } from "@/lib/print/estimate";
const part = { file_name: "seat.stl", total_volume_cm3: "100", total_surface_area_cm2: "200", objects: [{ name: "part", bbox_x_mm: "50", bbox_y_mm: "50", bbox_z_mm: "50" }] };
const size = [{ sizeLabel: "15cm", nuiSizeCm: 15, scaleRatio: 1 }];
test("all parts contribute material and time; handling is charged once per product", () => {
  const [result] = combinedEstimates([part, { ...part, file_name: "legs.stl" }], size, { ...DEFAULT_PRICING, handlingBaseYen: 100 });
  expect(result).toMatchObject({ volumeCm3: 200, surfaceAreaCm2: 400, partCount: 2, grams: 75.1, isPrintable: true });
  expect(result.hours).toBeGreaterThan(combinedEstimates([part], size, DEFAULT_PRICING)[0].hours);
  expect(result.printFeeJpy).toBe(Math.round(75.1 * 3.5) + Math.round(result.hours * 75) + 100 + 40);
});
test("a too-large part in an additional file blocks that size and identifies its file", () => {
  const [result] = combinedEstimates([part, { ...part, file_name: "large.stl", objects: [{ ...part.objects[0], bbox_x_mm: "500" }] }], size, DEFAULT_PRICING);
  expect(result.isPrintable).toBe(false);
  expect(result.oversizedParts).toEqual(["large.stl / part"]);
});

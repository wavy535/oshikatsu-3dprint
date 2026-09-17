import { expect, test } from "vitest";
import { buildCalibrationMeshes } from "@/lib/ar/calibration";
import { AR_CALIBRATION } from "@/lib/ar/config";

const MM_PER_M = 1000;

function extentMm(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k] * MM_PER_M);
      max[k] = Math.max(max[k], positions[i + k] * MM_PER_M);
    }
  }
  return { min, max };
}

test("the A4 calibration plate has the size of an A4 sheet and lies on the floor", () => {
  const [plate] = buildCalibrationMeshes("a4-plate");
  const { min, max } = extentMm(plate.positions);
  expect(max[0] - min[0]).toBeCloseTo(AR_CALIBRATION.a4LongMm, 3);
  expect(max[2] - min[2]).toBeCloseTo(AR_CALIBRATION.a4ShortMm, 3);
  expect(max[1] - min[1]).toBeCloseTo(AR_CALIBRATION.plateThicknessMm, 3);
  expect(min[1]).toBeCloseTo(0, 3);
  expect(min[0] + max[0]).toBeCloseTo(0, 3);
  expect(min[2] + max[2]).toBeCloseTo(0, 3);
  expect(plate.material.color[3]).toBeLessThan(1);
});

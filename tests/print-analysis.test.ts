import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { analyzeModelFile } from "@/lib/print";
import { calcPrintFeeJpy, DEFAULT_PRICING } from "@/lib/print/estimate";

test("10mmの四面体を解析し、閉じたメッシュと体積を保つ", () => {
  const file = readFileSync(new URL("./fixtures/tetrahedron.stl", import.meta.url));
  const result = analyzeModelFile(file, { fileName: "tetrahedron.stl" });
  expect(result.triangleCount).toBe(4);
  expect(result.objects[0].isManifold).toBe(true);
  expect(result.totalVolumeCm3).toBeCloseTo(1 / 6, 2);
});

test("印刷費は材料・時間を個別に丸め、基本作業料とパーツ作業料を含める", () => {
  expect(calcPrintFeeJpy(0.5, 0.5, 2, {
    ...DEFAULT_PRICING,
    materialYenPerGram: 3, machineYenPerHour: 3,
    handlingBaseYen: 7, handlingPerPartYen: 11,
  })).toBe(33);
});

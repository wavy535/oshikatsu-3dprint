// ローカル検証用。実ファイルを解析パイプラインに通して結果を表示する。
//   node --experimental-strip-types scripts/analyze-file.ts <path>
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyzeModelFile } from "../src/lib/print/index";

const path = process.argv[2];
if (!path) {
  console.error("usage: analyze-file.ts <model.3mf|model.stl>");
  process.exit(1);
}

const buf = readFileSync(path);
const t0 = Date.now();
const r = analyzeModelFile(buf, { fileName: basename(path) });
const ms = Date.now() - t0;

console.log(`--- ${basename(path)} (${(buf.length / 1024 / 1024).toFixed(1)} MB) / ${ms} ms ---`);
console.log(`format=${r.format} unit=${r.unit}(declared=${r.unitDeclared}:${r.declaredUnit})`);
console.log(`objects=${r.objectCount} triangles=${r.triangleCount} vertices=${r.vertexCount}`);
console.log(`assembled=${r.assembledBboxMm.join(" x ")} mm  plate=${r.plateBboxMm.join(" x ")}  maxPart=${r.maxPartBboxMm.join(" x ")}`);
console.log(`volume=${r.totalVolumeCm3} cm3  area=${r.totalSurfaceAreaCm2} cm2`);
console.log(`estimate: ${r.baseEstimate.grams} g / ${r.baseEstimate.hours} h / ${r.baseEstimate.partCount} parts`);
console.log(`status=${r.status}`);
console.log("\nobjects:");
for (const o of r.objects) {
  console.log(
    `  ${String(o.objectIndex).padStart(2)} ${o.name.padEnd(18)} tri=${String(o.triangleCount).padStart(7)}` +
    ` bbox=${o.bboxMm.map((v) => v.toFixed(1)).join("x").padEnd(22)}` +
    ` vol=${o.volumeCm3.toFixed(1).padStart(7)}cm3 manifold=${o.isManifold ? "Y" : "N"}` +
    ` open=${o.openEdgeCount} flip=${o.flippedNormalCount} selfint=${o.selfIntersectionCount}` +
    ` minWall=${o.minWallThicknessMm === null ? "-" : o.minWallThicknessMm.toFixed(2)} thinArea=${(o.analysis.thickness.thinAreaRatio*100).toFixed(1)}%`
  );
}
console.log("\ncolor slots:");
for (const c of r.colorSlots) console.log(`  ${c.slotIndex} ${c.sourceName} ${c.sourceHex} faces=${c.faceCount}`);
console.log("\nissues:");
for (const i of r.issues) console.log(`  [${i.severity.toUpperCase().padEnd(7)}] ${i.code.padEnd(18)} ${i.message}`);
console.log("\nvariants:");
for (const v of r.variants) {
  console.log(
    `  ${v.sizeLabel.padEnd(6)} scale=${v.scaleRatio.toFixed(3)} bbox=${v.bboxMm.map((x) => x.toFixed(0)).join("x").padEnd(16)}` +
    ` ${String(v.grams).padStart(7)}g ${String(v.hours).padStart(6)}h batch=${v.batchCount}` +
    ` fee=¥${v.printFeeJpy.toLocaleString().padStart(7)} printable=${v.isPrintable ? "Y" : "N"}`
  );
}

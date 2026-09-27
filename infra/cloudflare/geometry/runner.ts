import { parentPort, workerData } from "node:worker_threads";
import { analyzeModelFile, type PricingRule } from "../../../src/lib/print/index.ts";
import { AnalysisBudget } from "../../../src/lib/print/limits.ts";
import { buildWorkMeshes, readModelObjects } from "../../../src/lib/ar/work-model.ts";
import { encodeGlb } from "../../../src/lib/ar/glb.ts";
import { encodeUsdz } from "../../../src/lib/ar/usdz.ts";

const { operation, url, headers, bytes } = workerData as {
  operation: string; url: string; headers: Record<string, string>; bytes: Uint8Array;
};
try {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileName = decodeURIComponent(headers["x-model-filename"] || "");
  if (!fileName || fileName.length > 200) throw new Error("Invalid file name");
  if (operation === "/analyze") {
    const rule: PricingRule = JSON.parse(headers["x-pricing-rule"]);
    if (!rule || Object.values(rule).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Invalid pricing rule");
    parentPort!.postMessage({ analysis: analyzeModelFile(buffer, { fileName, rule }), bytes: bytes.byteLength });
  } else {
    const params = new URL(url, "http://geometry").searchParams;
    const scale = Number(params.get("scale") ?? 1);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 100) throw new Error("Invalid model scale");
    const budget = new AnalysisBudget();
    const { meshes } = buildWorkMeshes(readModelObjects(buffer, fileName, budget), scale, budget);
    if (operation === "/validate-ar") parentPort!.postMessage({ bytes: bytes.byteLength });
    else {
      const format = params.get("format");
      if (format !== "glb" && format !== "usdz") throw new Error("Invalid format");
      const model = format === "glb" ? encodeGlb(meshes) : encodeUsdz(meshes);
      parentPort!.postMessage({ model, contentType: format === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip" });
    }
  }
} catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "Invalid 3D model" }); }

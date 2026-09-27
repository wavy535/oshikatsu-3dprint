import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, test } from "vitest";
import { analyzeModelFile, DEFAULT_PRICING } from "@/lib/print";
import { AnalysisBudget } from "@/lib/print/limits";
import { buildWorkMeshes, readModelObjects } from "@/lib/ar/work-model";
import { encodeGlb } from "@/lib/ar/glb";
import { encodeUsdz } from "@/lib/ar/usdz";
import { basematerialsXml, modelXml, modelZip, tetrahedronMeshWith } from "./helpers/model-files";

const base = process.env.GEOMETRY_TEST_URL || "http://127.0.0.1:8788";
describe.skipIf(process.env.TEST_GEOMETRY !== "true")("local geometry service parity", () => {
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local tests only");
  });
  const colored = modelZip(modelXml(basematerialsXml(1, [["Red", "#FF0000"], ["Blue", "#0000FF"]]) +
    `<object id="2" pid="1" pindex="0">${tetrahedronMeshWith([0, 0, 1, 1])}</object>`, '<item objectid="2"/>'));
  async function request(operation: string, bytes: Buffer, fileName: string) {
    return fetch(`${base}${operation}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Model-Filename": fileName,
        "X-Pricing-Rule": JSON.stringify(DEFAULT_PRICING) }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(10_000),
    });
  }
  test.each(["stl", "3mf"])("%s analysis matches the existing in-process implementation", async (format) => {
    const bytes = format === "stl" ? await readFile("tests/fixtures/tetrahedron.stl") : colored;
    const fileName = `tetrahedron.${format}`;
    const response = await request("/analyze", bytes, fileName);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bytes: bytes.length, analysis: analyzeModelFile(bytes, { fileName, rule: DEFAULT_PRICING }) });
  });
  test.each(["glb", "usdz"])("%s preserves AR scale, materials and bytes", async (format) => {
    const response = await request(`/convert-ar?format=${format}&scale=1.5`, colored, "colored.3mf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(format === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip");
    const { meshes } = buildWorkMeshes(readModelObjects(colored, "colored.3mf", new AnalysisBudget()), 1.5);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(format === "glb" ? encodeGlb(meshes) : encodeUsdz(meshes));
  });
  test("malformed models and invalid scales are rejected without terminating the service", async () => {
    expect((await request("/analyze", Buffer.from("invalid"), "bad.3mf")).status).toBe(422);
    expect((await request("/convert-ar?format=glb&scale=0", colored, "colored.3mf")).status).toBe(422);
    const valid = await request("/validate-ar", colored, "colored.3mf");
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ bytes: colored.length });
  });
});

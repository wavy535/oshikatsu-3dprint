import { readFile, writeFile, stat } from "node:fs/promises";
import Module from "manifold-3d";
import { DESIGN_FILE_LIMIT, readDesign } from "../src/lib/design/document.ts";
import { createGeometryEngine } from "../src/lib/design/geometry.ts";
import { exportDesign, type ExportFormat } from "../src/lib/design/export.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output || !/\.(zip|glb|usdz)$/.test(output)) {
  console.error("Usage: npm run design:export -- house.oshinest.json output.zip|output.glb|output.usdz");
  process.exitCode = 1;
} else {
  try {
    if ((await stat(input)).size > DESIGN_FILE_LIMIT) throw new Error("設計ファイルは32KiBまでです。");
    const design = readDesign(await readFile(input, "utf8"));
    const wasm = await Module(); wasm.setup();
    const engine = createGeometryEngine(wasm);
    const build = engine.build(design);
    const format: ExportFormat = output.endsWith(".zip") ? "3mf" : output.endsWith(".glb") ? "glb" : "usdz";
    await writeFile(output, exportDesign(design, build, format), { flag: "wx" });
    console.log(JSON.stringify({ output, parts: build.parts.length, issues: build.issues }, null, 2));
    engine.clear();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

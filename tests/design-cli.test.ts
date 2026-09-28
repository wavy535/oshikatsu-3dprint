import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { unzipSync } from "fflate";
import { defaultDesign } from "../src/lib/design/document.ts";

it("exports through the headless CLI without a browser and refuses to overwrite files", () => {
  const dir = mkdtempSync(join(tmpdir(), "oshinest-design-test-"));
  try {
    const input = join(dir, "house.json");
    writeFileSync(input, JSON.stringify(defaultDesign()));
    for (const extension of ["zip", "glb", "usdz"]) {
      const output = join(dir, `house.${extension}`);
      const args = ["--experimental-strip-types", "scripts/design-export.ts", input, output];
      execFileSync(process.execPath, args, { stdio: "pipe", timeout: 15_000 });
      const bytes = readFileSync(output);
      if (extension === "glb") expect(bytes.subarray(0, 4).toString()).toBe("glTF");
      else expect(Object.keys(unzipSync(bytes)).length).toBeGreaterThan(0);
      expect(() => execFileSync(process.execPath, args, { stdio: "pipe", timeout: 15_000 })).toThrow();
      expect(readFileSync(output)).toEqual(bytes);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);

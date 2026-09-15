import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listLocalModels, readLocalModel, realLocalModelDirectory } from "@/lib/ar/local-models";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ar-local-models-")));
const directory = join(root, "test_3mf");
mkdirSync(directory);
writeFileSync(join(directory, "2_Chair.gcode.3mf"), "chair");
writeFileSync(join(directory, "notes.md"), "memo");
mkdirSync(join(directory, "folder.3mf"));
writeFileSync(join(root, "outside.3mf"), "outside");

afterAll(() => rmSync(root, { recursive: true, force: true }));

test("only 3MF and STL files in the folder are listed, with their size and version", async () => {
  const models = await listLocalModels(directory);
  expect(models?.map((model) => [model.name, model.bytes])).toEqual([["2_Chair.gcode.3mf", 5]]);
  expect(models?.[0].version).toMatch(/^[0-9a-f]{8}$/);
  expect(await listLocalModels(join(root, "missing"))).toBeNull();
});

test("only listed files are read, so names cannot reach outside the folder", async () => {
  expect((await readLocalModel("2_Chair.gcode.3mf", directory))?.toString()).toBe("chair");
  expect(await readLocalModel("../outside.3mf", directory)).toBeNull();
  expect(await readLocalModel("notes.md", directory)).toBeNull();
  expect(await readLocalModel("folder.3mf", directory)).toBeNull();
  expect(await readLocalModel("2_Chair.gcode.3mf", join(root, "missing"))).toBeNull();
});

test("a linked folder (e.g. from a git worktree) is read through the link and reports where it points", async () => {
  const link = join(root, "linked_3mf");
  symlinkSync(directory, link);
  expect(await realLocalModelDirectory(link)).toBe(directory);
  expect((await listLocalModels(link))?.map((model) => model.name)).toEqual(["2_Chair.gcode.3mf"]);
  expect((await readLocalModel("2_Chair.gcode.3mf", link))?.toString()).toBe("chair");
  expect(await realLocalModelDirectory(join(root, "missing"))).toBeNull();
});

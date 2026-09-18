import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listLocalModelFolders, readLocalModel } from "@/lib/ar/local-models";

// local-notes/ に見立てた置き場所。直下のメモは見ず、フォルダごとに 3MF / STL / .blend を探す
const base = realpathSync(mkdtempSync(join(tmpdir(), "ar-local-models-")));
const root = join(base, "local-notes");
const shared = join(base, "main-checkout-roomfile");
mkdirSync(join(root, "test_3mf", "nested.3mf"), { recursive: true });
mkdirSync(shared);
writeFileSync(join(root, "memo.md"), "memo");
writeFileSync(join(root, "top-level.3mf"), "ignored");
writeFileSync(join(root, "test_3mf", "10_Table.gcode.3mf"), "table");
writeFileSync(join(root, "test_3mf", "2_Chair.gcode.3mf"), "chair");
writeFileSync(join(root, "test_3mf", ".DS_Store"), "hidden");
writeFileSync(join(shared, "room.STL"), "room");
writeFileSync(join(shared, "matsu_nuiroom.blend"), "blender");
writeFileSync(join(shared, "room.obj"), "wavefront");
symlinkSync(shared, join(root, "roomfile"));
writeFileSync(join(base, "outside.3mf"), "outside");

afterAll(() => rmSync(base, { recursive: true, force: true }));

test("each folder lists its 3MF, STL and .blend files in natural order, and names other files it cannot read", async () => {
  const folders = await listLocalModelFolders(root);
  expect(folders?.map((folder) => folder.folder)).toEqual(["roomfile", "test_3mf"]);

  const [roomfile, test3mf] = folders!;
  expect(test3mf.models.map((model) => [model.name, model.bytes])).toEqual([
    ["test_3mf/2_Chair.gcode.3mf", 5],
    ["test_3mf/10_Table.gcode.3mf", 5],
  ]);
  expect(test3mf.models[0].version).toMatch(/^[0-9a-f]{8}$/);
  expect(test3mf.unsupported).toEqual([]);
  expect(test3mf.linkedTo).toBeNull();

  // A linked folder, e.g. from a git worktree to the main checkout
  expect(roomfile.models.map((model) => model.name)).toEqual(["roomfile/matsu_nuiroom.blend", "roomfile/room.STL"]);
  expect(roomfile.unsupported).toEqual(["room.obj"]);
  expect(roomfile.linkedTo).toBe(shared);

  expect(await listLocalModelFolders(join(base, "missing"))).toBeNull();
});

test("only listed files are read, so names cannot reach outside the folders", async () => {
  expect((await readLocalModel("test_3mf/2_Chair.gcode.3mf", root))?.toString()).toBe("chair");
  expect((await readLocalModel("roomfile/room.STL", root))?.toString()).toBe("room");
  expect((await readLocalModel("roomfile/matsu_nuiroom.blend", root))?.toString()).toBe("blender");
  expect(await readLocalModel("roomfile/room.obj", root)).toBeNull();
  expect(await readLocalModel("top-level.3mf", root)).toBeNull();
  expect(await readLocalModel("test_3mf/../../outside.3mf", root)).toBeNull();
  expect(await readLocalModel("test_3mf/nested.3mf", root)).toBeNull();
  expect(await readLocalModel("test_3mf/2_Chair.gcode.3mf", join(base, "missing"))).toBeNull();
});

test("the default local model root cannot be used in production", async () => {
  const { localModelRoot } = await import("@/lib/ar/local-models");
  vi.stubEnv("NODE_ENV", "production");
  try {
    expect(() => localModelRoot()).toThrow("only in development");
  } finally {
    vi.unstubAllEnvs();
  }
});

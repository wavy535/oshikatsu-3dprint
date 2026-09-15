import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ar/queries", () => ({ getArWorkSource: vi.fn() }));
vi.mock("@/lib/files/s3", () => ({ readModel: vi.fn() }));
import { GET as getRoom } from "@/app/api/ar/rooms/[file]/route";
import { GET as getWork } from "@/app/api/ar/works/[workId]/[file]/route";
import { getArWorkSource } from "@/lib/ar/queries";
import { assetVersion } from "@/lib/ar/version";
import { readModel } from "@/lib/files/s3";

const workId = "22222222-2222-2222-2222-222222222222";
const variantId = "33333333-3333-3333-3333-333333333333";
const stl = readFileSync(new URL("./fixtures/tetrahedron.stl", import.meta.url));
const source = { storagePath: "owner/work/model.stl", fileName: "model.stl", scaleRatio: 1 };
const GLB_MAGIC = 0x46546c67;

const context = <T>(params: T) => ({ params: Promise.resolve(params) });
const workRequest = (version: string) =>
  new Request(`https://example.test/api/ar/works/${workId}/${variantId}.glb?v=${version}`);

async function magicOf(response: Response) {
  return new DataView(await response.arrayBuffer()).getUint32(0, true);
}

test("the provisional room route returns a publicly cacheable GLB", async () => {
  const response = await getRoom(
    new Request("https://example.test/api/ar/rooms/three-walls.glb?sit=150&hug=120"),
    context({ file: "three-walls.glb" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/gltf-binary");
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(GLB_MAGIC);
});

test("the provisional room route rejects unknown layouts and incomplete measurements", async () => {
  const unknown = await getRoom(
    new Request("https://example.test/api/ar/rooms/four-walls.glb?sit=150&hug=120"),
    context({ file: "four-walls.glb" }),
  );
  expect(unknown.status).toBe(404);
  const noWidth = await getRoom(
    new Request("https://example.test/api/ar/rooms/three-walls.glb?sit=150"),
    context({ file: "three-walls.glb" }),
  );
  expect(noWidth.status).toBe(404);
});

test("the work route converts the stored model of a published work", async () => {
  vi.mocked(getArWorkSource).mockResolvedValue(source);
  vi.mocked(readModel).mockResolvedValue(stl);
  const response = await getWork(
    workRequest(assetVersion(source.storagePath)),
    context({ workId, file: `${variantId}.glb` }),
  );
  expect(response.status).toBe(200);
  expect(await magicOf(response)).toBe(GLB_MAGIC);
  expect(getArWorkSource).toHaveBeenCalledWith(workId, variantId);
  expect(readModel).toHaveBeenCalledWith(source.storagePath);
});

test("the work route hides unpublished works, stale versions and malformed ids without reading storage", async () => {
  vi.mocked(getArWorkSource).mockResolvedValue(null);
  expect((await getWork(workRequest("any"), context({ workId, file: `${variantId}.glb` }))).status).toBe(404);

  vi.mocked(getArWorkSource).mockResolvedValue(source);
  expect((await getWork(workRequest("stale"), context({ workId, file: `${variantId}.glb` }))).status).toBe(404);
  expect(
    (await getWork(workRequest("any"), context({ workId: "not-an-id", file: `${variantId}.glb` }))).status,
  ).toBe(404);
  expect(
    (await getWork(workRequest("any"), context({ workId, file: "not-an-id.glb" }))).status,
  ).toBe(404);
  expect(readModel).not.toHaveBeenCalled();
});

test("the work route answers 422 when the stored model cannot be converted", async () => {
  vi.mocked(getArWorkSource).mockResolvedValue(source);
  vi.mocked(readModel).mockResolvedValue(Buffer.from("not a model at all"));
  const response = await getWork(
    workRequest(assetVersion(source.storagePath)),
    context({ workId, file: `${variantId}.glb` }),
  );
  expect(response.status).toBe(422);
});

import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ar/queries", () => ({ getArWorkSource: vi.fn() }));
vi.mock("@/lib/files/s3", () => ({ readModel: vi.fn() }));
import { GET as getCalibration } from "@/app/api/ar/calibration/[file]/route";
import { GET as getRoom } from "@/app/api/ar/rooms/[file]/route";
import { GET as getWork } from "@/app/api/ar/works/[workId]/[file]/route";
import { getArWorkSource } from "@/lib/ar/queries";
import { modelRevision } from "@/lib/ar/revision";
import { assetVersion } from "@/lib/ar/version";
import { readModel } from "@/lib/files/s3";

const workId = "22222222-2222-2222-2222-222222222222";
const variantId = "33333333-3333-3333-3333-333333333333";
const stl = readFileSync(new URL("./fixtures/tetrahedron.stl", import.meta.url));
const source = { storagePath: "owner/work/model.stl", fileName: "model.stl", scaleRatio: 1 };
const GLB_MAGIC = 0x46546c67;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const STALE_REVISION = "00000000";

const context = <T>(params: T) => ({ params: Promise.resolve(params) });
const workRequest = (version: string, revision?: string) =>
  new Request(
    `https://example.test/api/ar/works/${workId}/${variantId}.glb?v=${version}` +
      (revision ? `&rev=${revision}` : ""),
  );
const roomRequest = (file: string, query: string) =>
  getRoom(new Request(`https://example.test/api/ar/rooms/${file}?${query}`), context({ file }));
const calibrationRequest = (file: string, query = "") =>
  getCalibration(new Request(`https://example.test/api/ar/calibration/${file}?${query}`), context({ file }));

async function magicOf(response: Response) {
  return new DataView(await response.arrayBuffer()).getUint32(0, true);
}

test("the provisional room route returns a GLB that is cacheable only for the current revision", async () => {
  const response = await roomRequest("three-walls.glb", `sit=150&hug=120&rev=${modelRevision()}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/gltf-binary");
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(GLB_MAGIC);

  const withoutRevision = await roomRequest("three-walls.glb", "sit=150&hug=120");
  expect(withoutRevision.status).toBe(200);
  expect(withoutRevision.headers.get("cache-control")).toBe("no-store");
  const stale = await roomRequest("three-walls.glb", `sit=150&hug=120&rev=${STALE_REVISION}`);
  expect(stale.headers.get("cache-control")).toBe("no-store");
});

test("the provisional room route serves USDZ for Quick Look", async () => {
  const response = await roomRequest("back-left.usdz", `sit=150&hug=120&rev=${modelRevision()}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/vnd.usdz+zip");
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(ZIP_LOCAL_SIGNATURE);
});

test("the provisional room route rejects unknown layouts and incomplete measurements", async () => {
  expect((await roomRequest("four-walls.glb", "sit=150&hug=120")).status).toBe(404);
  expect((await roomRequest("three-walls.glb", "sit=150")).status).toBe(404);
});

test("the calibration route serves the A4 plate as USDZ and GLB with the same cache rule", async () => {
  const usdz = await calibrationRequest("a4-plate.usdz", `rev=${modelRevision()}`);
  expect(usdz.status).toBe(200);
  expect(usdz.headers.get("content-type")).toBe("model/vnd.usdz+zip");
  expect(usdz.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(usdz)).toBe(ZIP_LOCAL_SIGNATURE);

  const glb = await calibrationRequest("a4-plate.glb");
  expect(glb.status).toBe(200);
  expect(glb.headers.get("content-type")).toBe("model/gltf-binary");
  expect(glb.headers.get("cache-control")).toBe("no-store");
  expect(await magicOf(glb)).toBe(GLB_MAGIC);

  expect((await calibrationRequest("a3-plate.usdz")).status).toBe(404);
});

test("the work route converts the stored model of a published work", async () => {
  vi.mocked(getArWorkSource).mockResolvedValue(source);
  vi.mocked(readModel).mockResolvedValue(stl);
  const response = await getWork(
    workRequest(assetVersion(source.storagePath), modelRevision()),
    context({ workId, file: `${variantId}.glb` }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(GLB_MAGIC);
  expect(getArWorkSource).toHaveBeenCalledWith(workId, variantId);
  expect(readModel).toHaveBeenCalledWith(source.storagePath);

  const withoutRevision = await getWork(
    workRequest(assetVersion(source.storagePath)),
    context({ workId, file: `${variantId}.glb` }),
  );
  expect(withoutRevision.status).toBe(200);
  expect(withoutRevision.headers.get("cache-control")).toBe("no-store");
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

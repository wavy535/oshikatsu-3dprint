import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ar/queries", () => ({ getArWorkSource: vi.fn() }));
vi.mock("@/lib/files/s3", () => ({ readModel: vi.fn() }));
vi.mock("@/lib/ar/local-models", () => ({ readLocalModel: vi.fn() }));
import { GET as getCalibration } from "@/app/api/ar/calibration/[file]/route";
import { GET as getLocalModel } from "@/app/api/ar/dev/local-models/[file]/route";
import { GET as getRoom } from "@/app/api/ar/rooms/[file]/route";
import { GET as getWork } from "@/app/api/ar/works/[workId]/[file]/route";
import { readLocalModel } from "@/lib/ar/local-models";
import { localModelPath } from "@/lib/ar/params";
import { getArWorkSource } from "@/lib/ar/queries";
import { modelRevision } from "@/lib/ar/revision";
import { assetVersion } from "@/lib/ar/version";
import { readModel } from "@/lib/files/s3";
import { bambuStylePackage } from "./helpers/model-files";

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
const localModelRequest = (path: string) => {
  const url = new URL(path, "https://example.test");
  return getLocalModel(new Request(url), context({ file: url.pathname.split("/").at(-1)! }));
};

async function magicOf(response: Response) {
  return new DataView(await response.arrayBuffer()).getUint32(0, true);
}

test("the provisional room route returns a GLB that is cacheable only for the current revision", async () => {
  const response = await roomRequest("three-walls.glb", `height=170&sit=150&hug=120&rev=${modelRevision()}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/gltf-binary");
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(GLB_MAGIC);

  const withoutRevision = await roomRequest("three-walls.glb", "height=170&sit=150&hug=120");
  expect(withoutRevision.status).toBe(200);
  expect(withoutRevision.headers.get("cache-control")).toBe("no-store");
  const stale = await roomRequest("three-walls.glb", `height=170&sit=150&hug=120&rev=${STALE_REVISION}`);
  expect(stale.headers.get("cache-control")).toBe("no-store");
});

test("the provisional room route serves USDZ for Quick Look, also for a nui registered with its height only", async () => {
  const heightOnly = await roomRequest("back-left.usdz", `height=150&rev=${modelRevision()}`);
  expect(heightOnly.status).toBe(200);
  const response = await roomRequest("back-left.usdz", `height=170&sit=150&hug=120&rev=${modelRevision()}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/vnd.usdz+zip");
  expect(response.headers.get("cache-control")).toMatch(/^public/);
  expect(await magicOf(response)).toBe(ZIP_LOCAL_SIGNATURE);
});

test("the provisional room route rejects unknown layouts and measurements without a height", async () => {
  expect((await roomRequest("four-walls.glb", "height=170&sit=150&hug=120")).status).toBe(404);
  expect((await roomRequest("three-walls.glb", "sit=150&hug=120")).status).toBe(404);
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

test("the dev route converts a local Bambu Studio 3MF and never lets it be cached", async () => {
  vi.mocked(readLocalModel).mockResolvedValue(bambuStylePackage());
  const response = await localModelRequest(
    localModelPath("1_Chair_01.gcode.3mf", "f00d", modelRevision(), "usdz"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("model/vnd.usdz+zip");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await magicOf(response)).toBe(ZIP_LOCAL_SIGNATURE);
  expect(readLocalModel).toHaveBeenCalledWith("1_Chair_01.gcode.3mf");
});

test("the dev route answers 404 for unknown files and in production, and 422 with the reason for broken data", async () => {
  vi.mocked(readLocalModel).mockResolvedValue(null);
  expect((await localModelRequest(localModelPath("missing.3mf", "f00d", modelRevision()))).status).toBe(404);
  expect((await localModelRequest("/api/ar/dev/local-models/model.usdz")).status).toBe(404);

  vi.mocked(readLocalModel).mockResolvedValue(Buffer.from("not a model at all"));
  const broken = await localModelRequest(localModelPath("broken.3mf", "f00d", modelRevision()));
  expect(broken.status).toBe(422);
  expect(await broken.text()).not.toBe("");

  vi.mocked(readLocalModel).mockResolvedValue(bambuStylePackage());
  vi.stubEnv("NODE_ENV", "production");
  try {
    const response = await localModelRequest(localModelPath("1_Chair_01.gcode.3mf", "f00d", modelRevision()));
    expect(response.status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
  }
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

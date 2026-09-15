import { expect, test } from "vitest";
import { AR_LIMITS } from "@/lib/ar/config";
import { buildArModelOptions, nuiDimensionsOf } from "@/lib/ar/options";
import {
  calibrationModelPath,
  localModelPath,
  nuiSearchParams,
  parseCalibrationFile,
  parseLocalModelRequest,
  parseNuiQuery,
  parseRoomFile,
  parseWorkFile,
  quickLookUrl,
  revisionOfUrl,
  roomModelPath,
  workModelPath,
} from "@/lib/ar/params";
import { modelRevision } from "@/lib/ar/revision";

const workId = "22222222-2222-2222-2222-222222222222";
const variantId = "33333333-3333-3333-3333-333333333333";
const nui = { heightMm: 170, sitHeightMm: 150, shoulderWidthMm: null, hugWidthMm: 120.5 };
const heightOnly = { heightMm: 150, sitHeightMm: null, shoulderWidthMm: null, hugWidthMm: null };
const origin = "https://example.test";
const revision = "0123abcd";

test("room file names map to a layout and a model format, anything else is rejected", () => {
  expect(parseRoomFile("three-walls.glb")).toEqual({ layout: "three-walls", format: "glb" });
  expect(parseRoomFile("back-left.usdz")).toEqual({ layout: "back-left", format: "usdz" });
  expect(parseRoomFile("three-walls")).toBeNull();
  expect(parseRoomFile("three-walls.obj")).toBeNull();
  expect(parseRoomFile("four-walls.glb")).toBeNull();
  expect(parseRoomFile(".glb")).toBeNull();
});

test("calibration file names map to a model and a format", () => {
  expect(parseCalibrationFile("a4-plate.usdz")).toEqual({ model: "a4-plate", format: "usdz" });
  expect(parseCalibrationFile("a4-plate.glb")).toEqual({ model: "a4-plate", format: "glb" });
  expect(parseCalibrationFile("a3-plate.glb")).toBeNull();
  expect(parseCalibrationFile("a4-plate")).toBeNull();
});

test("nui dimensions and the model revision round-trip through the room model URL", () => {
  expect(parseNuiQuery(nuiSearchParams(nui))).toEqual(nui);
  expect(parseNuiQuery(nuiSearchParams(heightOnly))).toEqual(heightOnly);
  expect([...nuiSearchParams(heightOnly).keys()]).toEqual(["height"]);
  const url = new URL(roomModelPath("back-left", nui, revision), origin);
  expect(url.pathname).toBe("/api/ar/rooms/back-left.glb");
  expect(parseNuiQuery(url.searchParams)).toEqual(nui);
  expect(revisionOfUrl(url.searchParams)).toBe(revision);
  expect(revisionOfUrl(new URLSearchParams())).toBeNull();
  expect(new URL(roomModelPath("three-walls", nui, revision, "usdz"), origin).pathname).toBe(
    "/api/ar/rooms/three-walls.usdz",
  );
});

test("calibration URLs carry the model revision", () => {
  const url = new URL(calibrationModelPath("a4-plate", revision, "usdz"), origin);
  expect(url.pathname).toBe("/api/ar/calibration/a4-plate.usdz");
  expect(revisionOfUrl(url.searchParams)).toBe(revision);
});

test("local model URLs carry the file name, the file version and the model revision", () => {
  const name = "roomfile/椅子 01.gcode.3mf";
  const url = new URL(localModelPath(name, "f00d", revision, "usdz"), origin);
  expect(url.pathname).toBe("/api/ar/dev/local-models/model.usdz");
  expect(url.searchParams.get("v")).toBe("f00d");
  expect(revisionOfUrl(url.searchParams)).toBe(revision);
  expect(parseLocalModelRequest("model.usdz", url.searchParams)).toEqual({ name, format: "usdz" });
  expect(parseLocalModelRequest("model.glb", url.searchParams)).toEqual({ name, format: "glb" });
  expect(parseLocalModelRequest("other.usdz", url.searchParams)).toBeNull();
  expect(parseLocalModelRequest("model.obj", url.searchParams)).toBeNull();
  expect(parseLocalModelRequest("model.usdz", new URLSearchParams())).toBeNull();
});

test("Quick Look URLs are absolute USDZ links with fixed scaling", () => {
  const url = new URL(
    quickLookUrl("http://192.168.1.68:3000", roomModelPath("back-left", nui, revision, "usdz")),
  );
  expect(url.origin).toBe("http://192.168.1.68:3000");
  expect(url.pathname).toBe("/api/ar/rooms/back-left.usdz");
  expect(url.hash).toBe("#allowsContentScaling=0");
  expect(parseNuiQuery(url.searchParams)).toEqual(nui);
  expect(revisionOfUrl(url.searchParams)).toBe(revision);
});

test("nui queries without a height, outside the range or not numeric are rejected", () => {
  expect(parseNuiQuery(new URLSearchParams({ sit: "150", hug: "100" }))).toBeNull();
  expect(parseNuiQuery(new URLSearchParams({ height: "150", hug: "" }))).toBeNull();
  expect(parseNuiQuery(new URLSearchParams({ height: "abc" }))).toBeNull();
  expect(parseNuiQuery(new URLSearchParams({ height: String(AR_LIMITS.nuiDimensionMaxMm + 1) }))).toBeNull();
  expect(
    parseNuiQuery(new URLSearchParams({ height: "150", shoulder: String(AR_LIMITS.nuiDimensionMinMm - 1) })),
  ).toBeNull();
});

test("work model URLs carry the variant file, the asset version and the model revision", () => {
  const url = new URL(workModelPath(workId, variantId, "abc123", revision), origin);
  expect(url.pathname).toBe(`/api/ar/works/${workId}/${variantId}.glb`);
  expect(url.searchParams.get("v")).toBe("abc123");
  expect(revisionOfUrl(url.searchParams)).toBe(revision);
  expect(parseWorkFile(`${variantId}.glb`)).toBe(variantId);
  expect(parseWorkFile(variantId)).toBeNull();
  expect(parseWorkFile(`${variantId}.usdz`)).toBeNull();
  expect(parseWorkFile("../secret.glb")).toBeNull();
});

test("options list the work model and both provisional rooms with the current revision", () => {
  const result = buildArModelOptions({ workId, variantId, assetVersion: "v1", signedIn: true, nui });
  expect(result.options.map((option) => option.kind)).toEqual(["work", "three-walls", "back-left"]);
  expect(result.options[0].src).toBe(workModelPath(workId, variantId, "v1", modelRevision()));
  expect(result.options[1].src).toBe(roomModelPath("three-walls", nui, modelRevision()));
  expect(result.roomUnavailable).toBeNull();
  expect(result.interiorMm).not.toBeNull();
});

test("provisional rooms report why they are unavailable", () => {
  const base = { workId, variantId, assetVersion: null };
  expect(buildArModelOptions({ ...base, signedIn: false, nui: null })).toEqual({
    options: [],
    roomUnavailable: "signed_out",
    interiorMm: null,
  });
  expect(buildArModelOptions({ ...base, signedIn: true, nui: null }).roomUnavailable).toBe("no_nui");
  const tooTall = { ...nui, heightMm: AR_LIMITS.nuiDimensionMaxMm + 1 };
  const outOfRange = buildArModelOptions({ ...base, signedIn: true, nui: tooTall });
  expect(outOfRange.roomUnavailable).toBe("out_of_range");
  expect(outOfRange.options).toEqual([]);
});

test("a nui registered with its height only still gets both provisional rooms", () => {
  const result = buildArModelOptions({ workId, variantId, assetVersion: null, signedIn: true, nui: heightOnly });
  expect(result.roomUnavailable).toBeNull();
  expect(result.options.map((option) => option.kind)).toEqual(["three-walls", "back-left"]);
  expect(result.interiorMm).not.toBeNull();
});

test("profile rows with numeric strings become dimensions", () => {
  expect(
    nuiDimensionsOf({ height_mm: "170.0", sit_height_mm: "150.0", shoulder_width_mm: null, hug_width_mm: "120.5" }),
  ).toEqual({ heightMm: 170, sitHeightMm: 150, shoulderWidthMm: null, hugWidthMm: 120.5 });
  expect(nuiDimensionsOf({ height_mm: 150, sit_height_mm: null, shoulder_width_mm: null, hug_width_mm: null })).toEqual(
    heightOnly,
  );
});

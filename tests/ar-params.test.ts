import { expect, test } from "vitest";
import { AR_LIMITS } from "@/lib/ar/config";
import { buildArModelOptions, nuiDimensionsOf } from "@/lib/ar/options";
import {
  nuiSearchParams,
  parseNuiQuery,
  parseRoomFile,
  parseWorkFile,
  quickLookRoomUrl,
  roomModelPath,
  workModelPath,
} from "@/lib/ar/params";

const workId = "22222222-2222-2222-2222-222222222222";
const variantId = "33333333-3333-3333-3333-333333333333";
const nui = { sitHeightMm: 150, shoulderWidthMm: null, hugWidthMm: 120.5 };
const origin = "https://example.test";

test("room file names map to a layout and a model format, anything else is rejected", () => {
  expect(parseRoomFile("three-walls.glb")).toEqual({ layout: "three-walls", format: "glb" });
  expect(parseRoomFile("back-left.usdz")).toEqual({ layout: "back-left", format: "usdz" });
  expect(parseRoomFile("three-walls")).toBeNull();
  expect(parseRoomFile("three-walls.obj")).toBeNull();
  expect(parseRoomFile("four-walls.glb")).toBeNull();
  expect(parseRoomFile(".glb")).toBeNull();
});

test("nui dimensions round-trip through the room model URL", () => {
  expect(parseNuiQuery(nuiSearchParams(nui))).toEqual(nui);
  const url = new URL(roomModelPath("back-left", nui), origin);
  expect(url.pathname).toBe("/api/ar/rooms/back-left.glb");
  expect(parseNuiQuery(url.searchParams)).toEqual(nui);
  expect(new URL(roomModelPath("three-walls", nui, "usdz"), origin).pathname).toBe(
    "/api/ar/rooms/three-walls.usdz",
  );
});

test("Quick Look URLs are absolute USDZ links with fixed scaling", () => {
  const url = new URL(quickLookRoomUrl("http://192.168.1.68:3000", "back-left", nui));
  expect(url.origin).toBe("http://192.168.1.68:3000");
  expect(url.pathname).toBe("/api/ar/rooms/back-left.usdz");
  expect(url.hash).toBe("#allowsContentScaling=0");
  expect(parseNuiQuery(url.searchParams)).toEqual(nui);
});

test("nui queries without a width, outside the range or not numeric are rejected", () => {
  expect(parseNuiQuery(new URLSearchParams({ sit: "150" }))).toBeNull();
  expect(parseNuiQuery(new URLSearchParams({ sit: "150", hug: "" }))).toBeNull();
  expect(parseNuiQuery(new URLSearchParams({ sit: "abc", hug: "100" }))).toBeNull();
  expect(
    parseNuiQuery(new URLSearchParams({ sit: String(AR_LIMITS.nuiDimensionMaxMm + 1), hug: "100" })),
  ).toBeNull();
  expect(
    parseNuiQuery(new URLSearchParams({ sit: "150", shoulder: String(AR_LIMITS.nuiDimensionMinMm - 1) })),
  ).toBeNull();
});

test("work model URLs carry the variant file and the asset version", () => {
  const url = new URL(workModelPath(workId, variantId, "abc123"), origin);
  expect(url.pathname).toBe(`/api/ar/works/${workId}/${variantId}.glb`);
  expect(url.searchParams.get("v")).toBe("abc123");
  expect(parseWorkFile(`${variantId}.glb`)).toBe(variantId);
  expect(parseWorkFile(variantId)).toBeNull();
  expect(parseWorkFile(`${variantId}.usdz`)).toBeNull();
  expect(parseWorkFile("../secret.glb")).toBeNull();
});

test("options list the work model and both provisional rooms when data is available", () => {
  const result = buildArModelOptions({ workId, variantId, assetVersion: "v1", signedIn: true, nui });
  expect(result.options.map((option) => option.kind)).toEqual(["work", "three-walls", "back-left"]);
  expect(result.options[0].src).toBe(workModelPath(workId, variantId, "v1"));
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
  expect(
    buildArModelOptions({ ...base, signedIn: true, nui: { ...nui, hugWidthMm: null } }).roomUnavailable,
  ).toBe("no_width");
  const tooTall = { ...nui, sitHeightMm: AR_LIMITS.nuiDimensionMaxMm + 1 };
  const outOfRange = buildArModelOptions({ ...base, signedIn: true, nui: tooTall });
  expect(outOfRange.roomUnavailable).toBe("out_of_range");
  expect(outOfRange.options).toEqual([]);
});

test("profile rows with numeric strings become dimensions", () => {
  expect(nuiDimensionsOf({ sit_height_mm: "150.0", shoulder_width_mm: null, hug_width_mm: "120.5" })).toEqual({
    sitHeightMm: 150,
    shoulderWidthMm: null,
    hugWidthMm: 120.5,
  });
});

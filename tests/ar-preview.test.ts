import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ar/queries", () => ({ getArWorkSource: vi.fn() }));
vi.mock("@/lib/ar/request-origin", () => ({ requestPhoneOrigin: vi.fn() }));
import { getWorkArPreview } from "@/lib/ar/preview";
import { getArWorkSource } from "@/lib/ar/queries";
import { requestPhoneOrigin } from "@/lib/ar/request-origin";

const workId = "22222222-2222-2222-2222-222222222222";
const small = { id: "33333333-3333-3333-3333-333333333333", size_label: "10cm", nui_size_cm: 10 };
const large = { id: "44444444-4444-4444-4444-444444444444", size_label: "20cm", nui_size_cm: 20 };
const mainNui = {
  id: "main", name: "メイン", nui_size_cm: 10, is_main: true,
  height_mm: 100, sit_height_mm: null, shoulder_width_mm: null, hug_width_mm: null,
};
const otherNui = { ...mainNui, id: "other", name: "大きいぬい", nui_size_cm: 20, height_mm: 200, is_main: false };
const input = { workId, variants: [small, large], selected: small, signedIn: true, nuis: [mainNui, otherNui] };

beforeEach(() => {
  vi.mocked(getArWorkSource).mockResolvedValue({ storagePath: "owner/work/model.stl", fileName: "model.stl", scaleRatio: 1 });
  vi.mocked(requestPhoneOrigin).mockResolvedValue({ origin: "https://example.test", replacedLoopback: false });
});

test("choosing a nui changes the AR size and room, but preserves the purchase size", async () => {
  const preview = await getWorkArPreview({ ...input, nuiId: otherNui.id });
  expect(getArWorkSource).toHaveBeenCalledWith(workId, large.id);
  expect(preview.sizeLabel).toBe("20cm");
  expect(preview.baseQuery).toBe(`size=${small.id}`);
  expect(preview.selectedNuiId).toBe(otherNui.id);
  expect(preview.nuis[1].label).toBe("大きいぬい（20cm）");
  const room = new URL(preview.options.find((option) => option.kind === "three-walls")!.src, "https://example.test");
  expect(room.searchParams.get("height")).toBe("200");
  const qr = new URL(preview.qr!.url);
  expect(qr.pathname).toBe(`/api/ar/works/${workId}/${large.id}.usdz`);
  expect(qr.hash).toBe("#allowsContentScaling=0");
  expect(preview.qr!.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(preview.qrUnavailable).toBeNull();
});

test.each([undefined, "another-users-nui"])("an absent or unknown nui (%s) uses the purchase size and main room without a QR", async (nuiId) => {
  const preview = await getWorkArPreview({ ...input, nuiId });
  expect(getArWorkSource).toHaveBeenCalledWith(workId, small.id);
  expect(preview.selectedNuiId).toBeNull();
  expect(preview.qr).toBeNull();
  expect(requestPhoneOrigin).not.toHaveBeenCalled();
  const room = new URL(preview.options.find((option) => option.kind === "three-walls")!.src, "https://example.test");
  expect(room.searchParams.get("height")).toBe("100");
});

test("an unsupported nui size keeps the room, without falling back to a different work size", async () => {
  const preview = await getWorkArPreview({ ...input, variants: [small], nuiId: otherNui.id });
  expect(getArWorkSource).not.toHaveBeenCalled();
  expect(preview.options.map((option) => option.kind)).toEqual(["three-walls", "back-left"]);
  expect(preview.qrUnavailable).toBe("no_size");
  expect(preview.qr).toBeNull();
});

test("a missing model is distinguished from a missing size", async () => {
  vi.mocked(getArWorkSource).mockResolvedValue(null);
  const preview = await getWorkArPreview({ ...input, nuiId: mainNui.id });
  expect(preview.qrUnavailable).toBe("no_model");
  expect(preview.qr).toBeNull();
  expect(requestPhoneOrigin).not.toHaveBeenCalled();
});

test("signed-out visitors can preview the work without a room or QR", async () => {
  const preview = await getWorkArPreview({ ...input, signedIn: false, nuis: [] });
  expect(preview.options.map((option) => option.kind)).toEqual(["work"]);
  expect(preview.roomUnavailable).toBe("signed_out");
  expect(preview.qr).toBeNull();
});

test("an unreachable phone origin leaves the in-page model available", async () => {
  vi.mocked(requestPhoneOrigin).mockResolvedValue(null);
  const preview = await getWorkArPreview({ ...input, nuiId: mainNui.id });
  expect(preview.options[0].kind).toBe("work");
  expect(preview.qr).toBeNull();
  expect(preview.qrUnavailable).toBeNull();
});

test("source failures propagate instead of displaying a missing model", async () => {
  vi.mocked(getArWorkSource).mockRejectedValue(new Error("database unavailable"));
  await expect(getWorkArPreview(input)).rejects.toThrow("database unavailable");
});

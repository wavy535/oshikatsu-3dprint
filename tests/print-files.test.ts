import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ getUserProfile: vi.fn() }));
vi.mock("@/lib/files/s3", () => ({ signedDownload: vi.fn() }));
import { getUserProfile } from "@/lib/auth/guards";
import { signedDownload } from "@/lib/files/s3";
import { GET } from "@/app/api/admin/print-jobs/[jobId]/files/[index]/route";
import { mockDatabase } from "./helpers/database";
const jobId = "10000000-0000-4000-8000-000000000001";
const { db, query } = mockDatabase();
async function download(index = "1") {
  return GET(new Request("http://localhost"), { params: Promise.resolve({ jobId, index }) });
}
beforeEach(() => {
  query.mockResolvedValue({ rows: [{ print_assets_snapshot: [
    { file_name: "seat.stl", storage_path: "purchased/seat.stl", scale_ratio: 1 },
    { file_name: "legs.stl", storage_path: "purchased/legs.stl", scale_ratio: 1 },
  ] }] });
  vi.mocked(getUserProfile).mockResolvedValue({ db, profile: { role: "admin" } } as Awaited<ReturnType<typeof getUserProfile>>);
  vi.mocked(signedDownload).mockResolvedValue("https://storage.invalid/signed");
});
test("only the purchased print path is signed, with no public cache", async () => {
  const response = await download();
  expect(response.status).toBe(307);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(signedDownload).toHaveBeenCalledWith("work-stl", "purchased/legs.stl");
  expect(query.mock.calls[0][1]).toContain(jobId);
});
test.each([null, "buyer", "creator"])("%s cannot download print files", async (role) => {
  vi.mocked(getUserProfile).mockResolvedValue({ db, profile: role ? { role } : null } as Awaited<ReturnType<typeof getUserProfile>>);
  expect((await download()).status).toBe(404);
  expect(query).not.toHaveBeenCalled();
  expect(signedDownload).not.toHaveBeenCalled();
});
test.each(["-1", "2", "100", "1.5"])("invalid file index %s is not signed", async (index) => {
  expect((await download(index)).status).toBe(404);
  expect(signedDownload).not.toHaveBeenCalled();
});

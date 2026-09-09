import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getOptionalUser: vi.fn() }));
vi.mock("@/lib/works/asset-validation", () => ({ validateAndPersistAsset: vi.fn(), replaceAsset: vi.fn() }));

import { mockDatabase } from "./helpers/database";
import { getOptionalUser } from "@/lib/auth/guards";
import { replaceAsset, validateAndPersistAsset } from "@/lib/works/asset-validation";
import { registerAssetAction, revalidateAssetAction } from "@/lib/works/step-actions";

const workId = "10000000-0000-4000-8000-000000000001";
const assetId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
let signedIn: boolean;
let ownsWork: boolean;
let assetBelongsToWork: boolean;
const filters: [string, unknown][] = [];

beforeEach(() => {
  signedIn = ownsWork = assetBelongsToWork = true;
  filters.length = 0;
  const { db, query } = mockDatabase();
  query.mockImplementation(async (sql, parameters) => {
    if (sql.includes('from "work_assets"')) {
      filters.push(["work_id", parameters[1]]);
      return { rows: assetBelongsToWork ? [{ id: assetId, work_id: workId }] : [] };
    }
    return { rows: [{ id: workId, creator_id: ownsWork ? userId : "another-creator", status: "draft" }] };
  });
  vi.mocked(getOptionalUser).mockImplementation(async () => ({ db, user: signedIn ? { id: userId } : null }) as Awaited<ReturnType<typeof getOptionalUser>>);
  vi.mocked(validateAndPersistAsset).mockResolvedValue({ ok: false, error: "parser reached", stage: "analyze" });
});

function input() {
  const form = new FormData();
  form.set("workId", workId);
  form.set("assetId", assetId);
  return form;
}

test("自作品のIDを添えても別作品のアセットを再解析できない", async () => {
  assetBelongsToWork = false;
  const result = await revalidateAssetAction({ error: null }, input());
  expect(result.error).toBeTruthy();
  expect(validateAndPersistAsset).not.toHaveBeenCalled();
});

test("本人の作品に属するアセットだけ解析へ渡す", async () => {
  await revalidateAssetAction({ error: null }, input());
  expect(filters).toContainEqual(["work_id", workId]);
  expect(validateAndPersistAsset).toHaveBeenCalledWith(assetId, workId);
});

test.each(["guest", "other creator"])("%s は解析を実行できない", async (role) => {
  signedIn = role !== "guest";
  ownsWork = false;
  await revalidateAssetAction({ error: null }, input());
  expect(validateAndPersistAsset).not.toHaveBeenCalled();
});

test("不正なIDはDBと解析へ渡さない", async () => {
  const form = input();
  form.set("assetId", "not-an-id");
  const result = await revalidateAssetAction({ error: null }, form);
  expect(result.error).toBeTruthy();
  expect(getOptionalUser).not.toHaveBeenCalled();
  expect(validateAndPersistAsset).not.toHaveBeenCalled();
});


test.each(["guest", "other creator", "foreign path"])("%s cannot replace an asset or trigger a download", async (role) => {
  signedIn = role !== "guest";
  ownsWork = role !== "other creator";
  const fd = input();
  fd.set("fileName", "model.stl");
  fd.set("fileSize", "100");
  fd.set("storagePath", `${role === "foreign path" ? "another-user" : userId}/${workId}/model.stl`);
  expect((await registerAssetAction({ error: null }, fd)).error).toBeTruthy();
  expect(replaceAsset).not.toHaveBeenCalled();
});

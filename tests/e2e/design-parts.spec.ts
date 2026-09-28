import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { applyProposal } from "../../src/lib/design/ai-contract";
import type { Furniture } from "../../src/lib/design/document";

test.use({ viewport: { width: 390, height: 844 } });
test("chat creates two shelves and a real round window; selected editing preserves the other part", async ({ page }) => {
  let calls = 0;
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const first: Furniture = { id: "furniture-1", name: "左の棚", kind: "shelf", width: 40, depth: 30, height: 50, x: 10, y: 110, color: "#AABBCC" };
  const second: Furniture = { ...first, id: "furniture-2", name: "右の棚", x: 70 };
  await page.route("**/api/design/chat", async (route) => {
    const body = route.request().postDataJSON(); calls++;
    if (calls === 2) expect(body.selected).toBe("furniture-2");
    const changes = calls === 1 ? [
      { path: "window.shape", value: "ellipse" }, { path: "window.width", value: 60 },
      { path: "furniture.upsert", value: first }, { path: "furniture.upsert", value: second },
    ] : [{ path: "furniture.upsert", value: { ...second, color: "#FF0000" } }];
    const p = { message: "棚と窓を調整しました", changes };
    await route.fulfill({ json: { ...p, design: applyProposal(body.design, p).design, attempts: 2 } });
  });
  await page.goto("/create");
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
  await page.getByLabel("変えたいところ", { exact: true }).fill("丸窓にして棚を2つ並べて");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByLabel("窓の形", { exact: true })).toHaveValue("ellipse");
  await expect(page.getByRole("log")).toContainText("再調整しました");
  await page.getByLabel("部品一覧").getByRole("button", { name: "右の棚", exact: true }).click();
  await page.getByLabel("変えたいところ", { exact: true }).fill("これだけ赤くして");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("#FF0000");
  await expect(page.getByRole("button", { name: "印刷用3MFを保存" })).toBeEnabled();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const files = unzipSync(await readFile((await (await downloading).path())!));
  const d = JSON.parse(strFromU8(files["design.oshinest.json"]));
  expect(d.furniture[0]).toEqual(first);
  expect(d.furniture[1].color).toBe("#FF0000");
  expect(files["furniture-2.3mf"]).toBeDefined();
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("窓の形", { exact: true })).toHaveValue("rectangle");
  await expect(page.getByLabel("部品一覧").getByRole("button", { name: "左の棚", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("manual furniture can be added, edited, removed and restored without AI", async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel("追加する家具", { exact: true }).selectOption("table");
  await page.getByRole("button", { name: "家具を追加", exact: true }).click();
  await page.locator("summary").filter({ hasText: "テーブル 1" }).click();
  await page.getByLabel("テーブル 1の幅", { exact: true }).fill("60");
  await page.getByLabel("テーブル 1の幅", { exact: true }).press("Tab");
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
  await page.getByRole("button", { name: "テーブル 1を削除", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "テーブル 1" })).toHaveCount(0);
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "テーブル 1" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

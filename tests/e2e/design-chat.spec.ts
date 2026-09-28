import { expect, test, type Page } from "@playwright/test";
import { applyProposal } from "../../src/lib/design/ai-contract";

test.use({ viewport: { width: 390, height: 844 } });
async function ready(page: Page) {
  await page.goto("/create");
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
}
async function send(page: Page, text: string) {
  await page.getByLabel("変えたいところ", { exact: true }).fill(text);
  await page.getByRole("button", { name: "送信して編集" }).click();
}

test("chat edits repeatedly from latest design, shares undo and sends bounded conversation", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  let calls = 0;
  await page.route("**/api/design/chat", async (route) => {
    const body = route.request().postDataJSON();
    calls++;
    if (calls === 2) { expect(body.design.house.width).toBe(210); expect(body.history).toHaveLength(2); expect(body.history[1].content).toContain("適用した変更:"); expect(body.history[1].content).not.toContain("幅を20mm広げました"); }
    const proposal = calls === 1 ? { message: "幅を20mm広げました。", changes: [{ path: "house.width", value: 210 }] } : { message: "棚を右奥に置きました。", changes: [{ path: "shelf.enabled", value: true }, { path: "shelf.x", value: 152 }, { path: "shelf.y", value: 122 }] };
    const result = applyProposal(body.design, proposal);
    await route.fulfill({ json: { ...proposal, design: result.design, attempts: 1 } });
  });
  await ready(page);
  await send(page, "幅を2cm広げて");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
  await expect(page.getByRole("log")).toContainText("190mm → 210mm");
  await send(page, "右奥に棚を置いて");
  await expect(page.getByLabel("棚を置く")).toBeChecked();
  await expect(page.getByLabel("左端からの位置")).toHaveValue("152");
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("棚を置く")).not.toBeChecked();
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
  await page.getByRole("button", { name: "会話をクリア" }).click();
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("late AI results never overwrite manual edits", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route("**/api/design/chat", async (route) => {
    const body = route.request().postDataJSON();
    await gate;
    const proposal = { message: "幅を変えました", changes: [{ path: "house.width", value: 220 }] };
    await route.fulfill({ json: { ...proposal, design: applyProposal(body.design, proposal).design, attempts: 1 } });
  });
  await ready(page);
  const started = page.waitForRequest("**/api/design/chat");
  await send(page, "幅を220mmにして"); await started;
  await page.getByLabel("幅", { exact: true }).fill("200");
  await page.getByLabel("幅", { exact: true }).press("Tab");
  release();
  await expect(page.getByRole("alert")).toContainText("設計が変わりました");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("200");
  await expect(page.getByRole("log")).toHaveCount(0);
});

test("login errors retain prompt for retry and invalid proposals leave design unchanged", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/design/chat", async (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 401, json: { error: "ログインしてください" } });
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { message: "薄くしました", changes: [{ path: "house.thickness", value: 1 }], design: body.design, attempts: 1 } });
  });
  await ready(page);
  await send(page, "板厚を変えて");
  await expect(page.getByRole("link", { name: "ログインしてAIを使う" })).toBeVisible();
  await expect(page.getByLabel("変えたいところ", { exact: true })).toHaveValue("板厚を変えて");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("alert")).toContainText("板厚を2mm以上");
  await expect(page.getByLabel("板厚", { exact: true })).toHaveValue("3");
});

test("cancelled calls cannot apply and are retryable", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route("**/api/design/chat", async (route) => {
    await gate;
    await route.fulfill({ status: 502, json: { error: "中止済み" } }).catch(() => {});
  });
  await ready(page);
  const started = page.waitForRequest("**/api/design/chat");
  await send(page, "青くして"); await started;
  await page.getByRole("button", { name: "中止", exact: true }).click();
  release();
  await expect(page.getByRole("alert")).toContainText("中止しました");
  await expect(page.getByRole("button", { name: "送信して編集" })).toBeEnabled();
  await expect(page.getByRole("log")).toHaveCount(0);
});
